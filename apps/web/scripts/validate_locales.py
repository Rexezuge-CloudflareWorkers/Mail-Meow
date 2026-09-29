#!/usr/bin/env python3
"""Validate the SPA's translation bundles.

Two independent checks, because they fail for different reasons:

1. **Parity** — every locale carries exactly the same keys as `en`, with no
   extras, no empties, and matching `{{placeholder}}` sets. A missing key means
   a user sees the raw key or the English default.

2. **Usage** — every key is referenced by a `t('…')` call in `apps/web/src`,
   and every `t('…')` call resolves to a defined key.

The usage check is the one that was missing. Parity alone reported `ALL OK` on
a 29-key drift, because all twelve locales agreed with each other while
disagreeing with the code: six keys the UI calls were defined nowhere, so they
silently fell back to English in every language, and twenty-three were defined
in all twelve and never used. Both are invisible to a cross-locale comparison.

Dynamic keys such as the ``nav.${view}`` template in Header.tsx cannot be
resolved statically, so the referenced set is widened with an explicit
allow-list below. Keep it in sync if a component starts building key names.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC_DIR = os.path.join(ROOT, "apps", "web", "src")
LOCALES_DIR = os.path.join(SRC_DIR, "locales")
REFERENCE = "en"

# Keys built at runtime from a template literal, so static extraction cannot see
# them. The `nav.${view}` call in Header.tsx covers the view router.
DYNAMIC_KEYS = {"nav.mailboxes", "nav.processing", "nav.help"}


def flat(obj, prefix=""):
    """Yield every leaf key in a nested dict as a dotted path."""
    for key, value in obj.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            yield from flat(value, path + ".")
        else:
            yield path


def placeholders(value):
    return set(re.findall(r"\{\{(\w+)\}\}", value)) if isinstance(value, str) else set()


def load(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def check_parity(reference_keys):
    """Every locale must match `en` exactly."""
    ok = True
    for lang in sorted(os.listdir(LOCALES_DIR)):
        path = os.path.join(LOCALES_DIR, lang, "translation.json")
        if not os.path.isfile(path):
            continue
        data = load(path)
        keys = set(flat(data))
        missing = sorted(reference_keys - keys)
        extra = sorted(keys - reference_keys)
        empty = sorted(k for k, v in _leaves(data).items() if not str(v).strip())
        placeholder_mismatch = sorted(
            k
            for k in reference_keys & keys
            if placeholders(_leaves(data).get(k)) != placeholders(_leaves(load(os.path.join(LOCALES_DIR, REFERENCE, "translation.json"))).get(k))
        )
        status = "OK" if not (missing or extra or empty or placeholder_mismatch) else "FAIL"
        if status == "FAIL":
            ok = False
        print(
            f"{lang}: keys={len(keys)} missing={len(missing)} extra={len(extra)} "
            f"empty={len(empty)} ph_mismatch={len(placeholder_mismatch)} [{status}]"
        )
        for key in missing[:5]:
            print(f"   missing: {key}")
        for key in extra[:5]:
            print(f"   extra: {key}")
        for key in empty[:5]:
            print(f"   empty: {key}")
    return ok


def _leaves(data):
    return {key: value for key, value in ((k, v) for k, v in _leaf_items(data))}


def _leaf_items(obj, prefix=""):
    for key, value in obj.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            yield from _leaf_items(value, path + ".")
        else:
            yield path, value


def check_usage(reference_keys):
    """Every key must be used, and every `t()` call must resolve."""
    used = set()
    pattern = re.compile(r"""\bt\(\s*['"]([^'"]+)['"]""")
    for dirpath, _dirnames, filenames in os.walk(SRC_DIR):
        for name in filenames:
            if not name.endswith((".ts", ".tsx")):
                continue
            with open(os.path.join(dirpath, name), encoding="utf-8") as handle:
                source = handle.read()
            # Drop comments so a key named in prose is not counted as a use.
            source = re.sub(r"//.*?$|/\*.*?\*/", "", source, flags=re.S | re.M)
            used.update(pattern.findall(source))
    used |= DYNAMIC_KEYS

    unused = sorted(reference_keys - used)
    undefined = sorted(k for k in used - reference_keys if not k.startswith("-"))

    if unused or undefined:
        print(f"usage: [FAIL] unused={len(unused)} undefined={len(undefined)}")
        for key in unused:
            print(f"   defined but never used in t(): {key}")
        for key in undefined:
            print(f"   used in t() but not defined: {key}")
        return False
    print("usage: [OK] every key is used and every t() call resolves")
    return True


def main():
    reference = load(os.path.join(LOCALES_DIR, REFERENCE, "translation.json"))
    reference_keys = set(flat(reference))
    parity_ok = check_parity(reference_keys)
    usage_ok = check_usage(reference_keys)
    if parity_ok and usage_ok:
        print("ALL OK")
        return 0
    print("FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(main())
