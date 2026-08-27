# catgirls.zone

Five small things, each on its own path. Everything runs in the browser — no
backend, no accounts, no analytics, nothing uploaded.

| Path          | What it is                                                        |
| ------------- | ----------------------------------------------------------------- |
| `/tools`      | Developer tool belt: Base64, JWT decoding, UUIDs, hashes, regex tester, cron parser, timestamps, JSON formatter, text diff |
| `/wort`       | One five-letter word puzzle a day, derived from the date          |
| `/kaomoji`    | Searchable kaomoji collection, keyboard driven                    |
| `/nyanifier`  | Text transformer in four levels — also a library and a CLI        |
| `/cafe`       | Idle game: staff, upgrades, prestige, offline earnings            |
| `/casino`     | Play-money slots, roulette and blackjack with honest, stated odds |

## Why client-side

The tool belt is the clearest case: people paste production tokens and customer
data into random websites to decode them. Here the page is the whole program —
open the network tab and watch it stay empty.

## Layout

```
assets/          shared stylesheet, tiny DOM helpers, one script per app
  site.css       the whole design system, such as it is
  ui.js          $ / el / toast / clipboard / shared header
  words.js       1034 five-letter words, generated and verified
  kaomoji.js     the kaomoji data
nyanifier/
  nyanify.js     the library — UMD, works in a browser and in node
  cli.js         command line wrapper
  package.json   so it can be published as a package
```

## Development

Static files, no build step, and **no backend of any kind** — nothing in this
repository runs on a server. In production GitHub Pages just hands out the
files.

Locally you still need *some* static file server, because the pages reference
their assets absolutely (`/assets/site.css`), which under `file://` resolves to
the root of your disk rather than to the project. Any of these will do:

```sh
python3 -m http.server 8000    # already installed on most machines
npx serve .
php -S localhost:8000
```

Python is used above purely because it is usually present. It is a dev-time
convenience, not part of the site.

## Notable details

- **The word game** derives its answer from the local date, so the puzzle rolls
  over at the player's midnight rather than in the middle of their evening. The
  word list is shuffled once with a fixed seed, otherwise answers would march
  through the alphabet.
- **The nyanifier** is deterministic: the randomness is seeded from the input,
  so the same text always transforms the same way. URLs, e-mail addresses,
  handles and backticked code are pulled out before transformation and put back
  afterwards.
- **The café** grants offline earnings capped at eight hours, and stores
  everything in one localStorage key you can export as a string.
- **The casino** uses play money that cannot be bought and refills for free.
  Nothing is rigged in either direction. The slot machine's return-to-player is
  computed by enumerating all 216 reel combinations at page load rather than
  written down, so the advertised figure cannot drift from the paytable, and
  every roulette bet was verified to carry the same 36/37 expectation.

## License

CC0 / public domain.
