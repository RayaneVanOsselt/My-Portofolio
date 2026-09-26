#!/usr/bin/env python3
"""Build the trilingual static portfolio.

    python3 scripts/build.py

Reads   src/content/site.json + src/content/{fr,en,nl}.json + src/templates/**
Writes  index.html (fr, default), en/index.html, nl/index.html, 404.html,
        sitemap.xml, robots.txt, site.webmanifest

Only the Python standard library is used. Templates use a tiny mustache-like syntax:
    {{ path }}            escaped value          {{{ path }}}        raw HTML (trusted content)
    {{#each list as x}}   loop (@index, @num)    {{/each}}
    {{#if path}} … {{else}} … {{/if}}            {{> partial }}      include templates/partials/partial.html
"""
from __future__ import annotations

import datetime
import hashlib
import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
TEMPLATES = SRC / "templates"


class BuildError(Exception):
    pass


# --------------------------------------------------------------------------- template engine

TOKEN = re.compile(r"\{\{\{\s*(.+?)\s*\}\}\}|\{\{\s*(.+?)\s*\}\}", re.S)
MISSING = object()


def parse(source: str, name: str) -> list:
    root: list = []
    stack: list = [(None, root)]
    pos = 0
    for m in TOKEN.finditer(source):
        if m.start() > pos:
            stack[-1][1].append(("text", source[pos:m.start()]))
        pos = m.end()
        if m.group(1) is not None:
            stack[-1][1].append(("raw", m.group(1)))
            continue
        expr = m.group(2)
        if expr.startswith("#each "):
            parts = expr[6:].split(" as ")
            if len(parts) != 2:
                raise BuildError(f"{name}: expected '#each list as item', got '{expr}'")
            node = {"type": "each", "path": parts[0].strip(), "alias": parts[1].strip(), "body": []}
            stack[-1][1].append(node)
            stack.append((node, node["body"]))
        elif expr.startswith("#if "):
            node = {"type": "if", "path": expr[4:].strip(), "body": [], "else": []}
            stack[-1][1].append(node)
            stack.append((node, node["body"]))
        elif expr == "else":
            node = stack[-1][0]
            if not node or node["type"] != "if":
                raise BuildError(f"{name}: '{{{{else}}}}' outside of '#if'")
            stack[-1] = (node, node["else"])
        elif expr in ("/each", "/if"):
            node = stack.pop()[0]
            if not node or node["type"] != expr[1:]:
                raise BuildError(f"{name}: unexpected '{{{{{expr}}}}}'")
        elif expr.startswith(">"):
            stack[-1][1].append(("partial", expr[1:].strip()))
        elif expr.startswith("!"):
            continue  # comment
        else:
            stack[-1][1].append(("var", expr))
    if len(stack) != 1:
        raise BuildError(f"{name}: unclosed block '{stack[-1][0]['type']}'")
    if pos < len(source):
        root.append(("text", source[pos:]))
    return root


_cache: dict[str, list] = {}


def load_template(name: str) -> list:
    if name not in _cache:
        path = TEMPLATES / name
        _cache[name] = parse(path.read_text(encoding="utf-8"), name)
    return _cache[name]


def lookup(path: str, scopes: list[dict], strict: bool = True):
    head, *rest = path.split(".")
    for scope in reversed(scopes):
        if head in scope:
            value = scope[head]
            break
    else:
        if strict:
            raise BuildError(f"unknown variable '{path}'")
        return MISSING
    for part in rest:
        try:
            value = value[int(part)] if isinstance(value, list) else value[part]
        except (KeyError, IndexError, ValueError, TypeError):
            if strict:
                raise BuildError(f"unknown variable '{path}' (at '{part}')")
            return MISSING
    return value


def stringify(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return ""
    return str(value)


def render_nodes(nodes: list, scopes: list[dict]) -> str:
    out = []
    for node in nodes:
        if isinstance(node, tuple):
            kind, val = node
            if kind == "text":
                out.append(val)
            elif kind == "var":
                out.append(html.escape(stringify(lookup(val, scopes)), quote=True))
            elif kind == "raw":
                out.append(stringify(lookup(val, scopes)))
            elif kind == "partial":
                out.append(render_nodes(load_template(f"partials/{val}.html"), scopes))
        elif node["type"] == "each":
            items = lookup(node["path"], scopes)
            if not isinstance(items, list):
                raise BuildError(f"'#each {node['path']}' is not a list")
            for i, item in enumerate(items):
                scope = {node["alias"]: item, "@index": i, "@num": f"{i + 1:02d}",
                         "@first": i == 0, "@last": i == len(items) - 1}
                out.append(render_nodes(node["body"], scopes + [scope]))
        elif node["type"] == "if":
            value = lookup(node["path"], scopes, strict=False)
            truthy = value is not MISSING and bool(value)
            out.append(render_nodes(node["body"] if truthy else node["else"], scopes))
    return "".join(out)


def render(name: str, context: dict) -> str:
    return render_nodes(load_template(name), [context])


# --------------------------------------------------------------------------- content helpers

def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise BuildError(f"{path.relative_to(ROOT)}: invalid JSON ({exc})") from exc


def shape(value, path="") -> set[str]:
    """Flatten a JSON structure into a set of key paths (list lengths included)."""
    keys = set()
    if isinstance(value, dict):
        for k, v in value.items():
            keys.add(f"{path}.{k}")
            keys |= shape(v, f"{path}.{k}")
    elif isinstance(value, list):
        keys.add(f"{path}[{len(value)}]")
        for i, v in enumerate(value):
            keys |= shape(v, f"{path}[{i}]")
    return keys


def check_translations(translations: dict[str, dict], reference: str) -> None:
    ref = shape(translations[reference])
    problems = []
    for code, data in translations.items():
        other = shape(data)
        for key in sorted(ref - other):
            problems.append(f"  {code}: missing {key}")
        for key in sorted(other - ref):
            problems.append(f"  {code}: unexpected {key}")
    if problems:
        raise BuildError("translation files are out of sync:\n" + "\n".join(problems))


NBSP, NNBSP = " ", " "


def french_typography(value):
    """Non-breaking spaces before high punctuation and inside guillemets (French convention)."""
    if isinstance(value, dict):
        return {k: french_typography(v) for k, v in value.items()}
    if isinstance(value, list):
        return [french_typography(v) for v in value]
    if not isinstance(value, str):
        return value
    value = re.sub(r" ([:;!?»])", lambda m: (NBSP if m.group(1) in ":»" else NNBSP) + m.group(1), value)
    return value.replace("« ", "«" + NBSP)


def picture(image: dict, base: str) -> dict:
    return {
        "srcset": ", ".join(f"{base}{image['stem']}-{w}.avif {w}w" for w in image["widths"]),
        "src": base + image["fallback"],
        "w": image["w"],
        "h": image["h"],
    }


def file_hash(*paths: Path) -> str:
    digest = hashlib.sha1()
    for path in paths:
        for file in sorted(path.rglob("*") if path.is_dir() else [path]):
            if file.is_file():
                digest.update(file.read_bytes())
    return digest.hexdigest()[:10]


def module_versions() -> dict[str, str]:
    """Content hash of every ES module, used to cache-bust imports through an import map."""
    js = ROOT / "assets" / "js"
    return {file.relative_to(ROOT).as_posix(): file_hash(file) for file in sorted(js.rglob("*.js"))}


# --------------------------------------------------------------------------- page context

def page_context(site: dict, t: dict, lang: dict, build: dict) -> dict:
    languages = site["languages"]
    code = lang["code"]
    base = "" if lang["path"] == "" else "../" * lang["path"].count("/")
    url = site["url"] + lang["path"]

    langs = []
    for other in languages:
        href = base + other["path"] if other["code"] != code else "./"
        langs.append({**other, "href": href or "./", "current": other["code"] == code})

    alternates = [{"hreflang": o["hreflang"], "url": site["url"] + o["path"]} for o in languages]
    alternates.append({"hreflang": "x-default", "url": site["url"]})

    projects = []
    for i, project in enumerate(site["projects"]):
        text = t["projects"][project["id"]]
        merged = {**project, **text, "num": f"{i + 1:02d}"}
        for key in ("shot", "logo", "image"):
            if key in project:
                merged[key] = picture(project[key], base)
        projects.append(merged)
    titles = {p["id"]: p["title"] for p in projects}

    skills = []
    for i, skill in enumerate(site["skills"]):
        text = t["skills"]["items"][skill["id"]]
        skills.append({
            **skill, **text,
            "icon": {"avif": f"{base}{skill['icon']}.avif", "png": f"{base}{skill['icon']}.png"},
            "levelLabel": t["skills"]["levels"][skill["level"]],
            "groupLabel": t["skills"]["groups"][skill["group"]],
            "usedIn": [{"id": pid, "title": titles[pid]} for pid in skill["projects"]],
            "selected": i == 0,
            "tabindex": 0 if i == 0 else -1,
        })

    mail_subject = quote(t["contact"]["mailSubject"])
    ui = {
        "form": t["form"],
        "email": site["email"],
        "mailto": f"mailto:{site['email']}?subject={mail_subject}",
        "copied": t["contact"]["copied"],
        "copy": t["contact"]["copy"],
        "subject": f"{site['form']['subject']} ({code.upper()})",
    }

    person = {
        "@type": "Person",
        "@id": site["url"] + "#person",
        "name": site["name"],
        "alternateName": site["brand"],
        "jobTitle": t["meta"]["jobTitle"],
        "url": site["url"],
        "email": f"mailto:{site['email']}",
        "telephone": site["phone"]["href"],
        "image": site["url"] + "assets/img/brand/og-image.jpg",
        "knowsAbout": ["Web development", "UX/UI design", "Figma", "Adobe Illustrator",
                       "Adobe Lightroom", "Adobe Premiere Pro", "WordPress"],
    }
    website = {
        "@type": "WebSite",
        "@id": site["url"] + "#website",
        "url": site["url"],
        "name": f"{site['brand']} — {site['name']}",
        "inLanguage": [l["hreflang"] for l in languages],
        "publisher": {"@id": site["url"] + "#person"},
    }
    webpage = {
        "@type": "WebPage",
        "@id": url + "#webpage",
        "url": url,
        "name": t["meta"]["title"],
        "description": t["meta"]["description"],
        "inLanguage": lang["hreflang"],
        "isPartOf": {"@id": site["url"] + "#website"},
        "about": {"@id": site["url"] + "#person"},
    }

    def script_json(data) -> str:
        return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    # Import map: every module URL resolves to a versioned URL, so a deploy never mixes old and new modules.
    prefix = base or "./"  # import map keys and values must be URL-like ("./", "../"), never bare
    import_map = {"imports": {f"{prefix}{path}": f"{prefix}{path}?v={version}"
                              for path, version in build["modules"].items()}}

    return {
        "t": t,
        "site": site,
        "build": build,
        "page": {
            "lang": code,
            "langUpper": code.upper(),
            "base": base,
            "url": url,
            "locale": lang["locale"],
            "otherLocales": [o["locale"] for o in languages if o["code"] != code],
            "alternates": alternates,
            "isDefault": code == site["defaultLanguage"],
            "mailto": ui["mailto"],
            "ui": script_json(ui),
            "importMap": script_json(import_map),
            # Fetch every module in parallel with main.js instead of discovering imports one level at a time.
            "modulePreloads": [f"{prefix}{path}?v={version}" for path, version in build["modules"].items()
                               if not path.endswith("main.js")],
            "jsonld": script_json({"@context": "https://schema.org", "@graph": [person, website, webpage]}),
        },
        "langs": langs,
        "nav": [{"id": s, "label": t["nav"][s]} for s in site["sections"]],
        "projects": {
            "featured": [p for p in projects if p["featured"]],
            "others": [p for p in projects if not p["featured"]],
            "count": f"{len(projects):02d}",
        },
        "skills": skills,
        "formNeeds": [{"value": v, "label": l} for v, l in zip(site["form"]["needs"], t["form"]["needs"])],
    }


# --------------------------------------------------------------------------- extra files

def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"  {path.relative_to(ROOT)}  ({len(content.encode('utf-8')) / 1024:.1f} KB)")


def sitemap(site: dict, today: str) -> str:
    rows = []
    for lang in site["languages"]:
        links = "".join(
            f'\n    <xhtml:link rel="alternate" hreflang="{o["hreflang"]}" href="{site["url"] + o["path"]}"/>'
            for o in site["languages"])
        links += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{site["url"]}"/>'
        rows.append(f"  <url>\n    <loc>{site['url'] + lang['path']}</loc>\n    <lastmod>{today}</lastmod>{links}\n  </url>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(rows) + "\n</urlset>\n")


def manifest(site: dict, t: dict) -> str:
    return json.dumps({
        "name": f"{site['brand']} — {site['name']}",
        "short_name": site["brand"],
        "description": t["meta"]["description"],
        "lang": site["defaultLanguage"],
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": "#000000",
        "theme_color": "#000000",
        "icons": [
            {"src": "assets/img/brand/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "assets/img/brand/icon-512.png", "sizes": "512x512", "type": "image/png"},
        ],
    }, ensure_ascii=False, indent=2) + "\n"


# --------------------------------------------------------------------------- main

def main() -> None:
    site = load_json(SRC / "content" / "site.json")
    codes = [l["code"] for l in site["languages"]]
    translations = {code: load_json(SRC / "content" / f"{code}.json") for code in codes}
    check_translations(translations, site["defaultLanguage"])
    translations["fr"] = french_typography(translations["fr"])

    today = datetime.date.today()
    build = {
        "year": today.year,
        "css": file_hash(ROOT / "assets" / "css"),
        "js": file_hash(ROOT / "assets" / "js"),
        "modules": module_versions(),
    }

    print("Building pages")
    for lang in site["languages"]:
        context = page_context(site, translations[lang["code"]], lang, build)
        write(ROOT / lang["path"] / "index.html", render("page.html", context))

    default = translations[site["defaultLanguage"]]
    context404 = {
        "site": site,
        "build": build,
        "messages": [{"code": l["code"], "url": site["url"] + l["path"], **translations[l["code"]]["notFound"]}
                     for l in site["languages"]],
        "t": default,
    }
    write(ROOT / "404.html", render("404.html", context404))
    write(ROOT / "sitemap.xml", sitemap(site, today.isoformat()))
    write(ROOT / "robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {site['url']}sitemap.xml\n")
    write(ROOT / "site.webmanifest", manifest(site, default))
    print("Done.")


if __name__ == "__main__":
    try:
        main()
    except BuildError as exc:
        print(f"Build failed: {exc}", file=sys.stderr)
        sys.exit(1)
