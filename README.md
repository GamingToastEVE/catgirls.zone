# catgirls.zone

Deterministic catgirl avatars. Type a name, get a catgirl — the same name
always gives the same catgirl.

**[catgirls.zone](https://catgirls.zone)**

## What it is

`nyavatar.js` is a single dependency-free file that turns any string into an
SVG catgirl. It hashes the string (FNV-1a), seeds a small PRNG (mulberry32),
and picks traits from fixed tables — so the output is identical on every
device and every page load, with nothing stored anywhere.

That makes it usable as an identicon: hash a user ID or email, get a stable
face, no uploads and no avatar storage.

## Usage

```html
<script src="https://catgirls.zone/nyavatar.js"></script>
<script>
  el.innerHTML = nyavatar("mia");                       // SVG markup
  img.src      = nyavatar.dataUri("mia", { size: 128 }); // data: URI
  nyavatar.traits("mia");                                // trait object
</script>
```

Also works as a CommonJS module (`require("./nyavatar.js")`) for server-side
rendering.

### Options

| Option  | Default | Meaning                             |
| ------- | ------- | ----------------------------------- |
| `size`  | `256`   | width/height in px (viewBox is 100) |
| `round` | `true`  | rounded-corner clip                 |

### Traits

ears (5) · hair style (7) · hair color (14) · eyes (6) · eye color (10) ·
mouth (5) · skin (6) · clothing (6) · background (6) · accessory (4) ·
blush · freckles · heterochromia · head tilt.

Everything is drawn in a chibi style: oversized round head, eyes taking up
about a third of the face with gradient irises and stacked highlights, tiny
nose and mouth, token shoulders. Outlines are never black — each shape's
stroke is its own fill mixed toward a single ink tone, which is what keeps it
looking drawn instead of clip-arted.

## Development

Static site, no build step. Serve the directory:

```sh
python3 -m http.server 8000
```

## License

CC0 / public domain. Take it, ship it, no credit needed.
