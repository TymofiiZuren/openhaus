#!/usr/bin/env bash
set -euo pipefail
processor=${1:?Pass the compiled panorama executable}

# A 2x2 black PPM has this exact header and twelve zero-valued RGB bytes.
cmp <(head -c 96 /dev/zero | "$processor" 8 4 front 2) \
    <(printf 'P6\n2 2\n255\n'; head -c 12 /dev/zero)

if "$processor" 8 4 front 2 </dev/null >/dev/null 2>&1; then
    echo 'FAIL: truncated input accepted' >&2; exit 1
fi
if head -c 97 /dev/zero | "$processor" 8 4 front 2 >/dev/null 2>&1; then
    echo 'FAIL: extra input accepted' >&2; exit 1
fi
for args in '8 4 invalid 2' '8 4 front 0' '8 4 front 4097' '9 4 front 2' '8x 4 front 2'; do
    # Intentional splitting of fixed test arguments.
    if "$processor" $args </dev/null >/dev/null 2>&1; then
        echo "FAIL: invalid arguments accepted: $args" >&2; exit 1
    fi
done
echo 'CLI pixel output and invalid input checks passed'
