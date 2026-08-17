# Stay

A rep counter for the moment you want to quit and don't.

**https://lochlan800.github.io/Thumb-test-/**

## The idea

The thing that's slipping isn't *time spent working* — it's the ability to feel
the pull to escape and stay anyway. So that's the only number on the front
page: **times you felt the pull and stayed.** Everything else is in service of
making that number go up honestly.

It doesn't block anything. It can't — a web page has no power over your phone,
and pretending otherwise would just be theatre. Blocking is Digital Wellbeing's
job. This is the rep counter that sits next to it.

## What it does

**Two-minute starts.** Avoidance lives at the beginning, not the middle. So the
only commitment it ever asks for is two minutes. You name what you're avoiding,
the clock runs, and at the bell you've genuinely finished what you promised.
Then it offers 5, 10 or 25 more — which you'll usually take, because starting
was the hard part.

**The ninety-second pause.** When you want out, one button holds you for ninety
seconds with what you were doing on screen. Both exits stay locked until the
timer ends, and then it's honestly your call. Urges peak and fade; most don't
survive the wait. Staying logs a rep. Quitting logs a quit, and that's fine.

**A blameless quit log.** When you do quit: one tap for how it felt, one
optional line. No shaming copy, no broken-streak animation.

**Patterns, not judgement.** The log shows when you tend to fold — morning,
afternoon, evening, late night. After a week that's usually a time of day or a
specific task, not a character flaw, and it's much easier to plan around a
9pm problem than a vague sense of weakness.

**A tally, not a streak.** Streaks punish one bad day by erasing the evidence,
which is exactly when people quit for good. A cumulative count and a best-week
figure can't be destroyed by a single slip, so a slip stays a slip.

## Put it on your home screen

Open the link in Chrome → menu (⋮) → **Add to Home screen**. It then opens
full-screen like an app, and works with no signal — the ninety-second pause is
useless if it needs to load first.

## Your data

Everything is in your browser's local storage. No account, no server, no
analytics, nothing leaves the phone. Clearing your browser data clears your
count, which is the honest tradeoff for never asking you to sign up.

## Running it

Static files, no build step. Open `index.html`, or serve the folder:

```
python3 -m http.server 8000
```

To publish: **Settings → Pages → Deploy from a branch**, pick this branch and
`/` as the folder.

```
index.html            all screens, one page
app.js                state machine, stats, storage
style.css             phone-first, light and dark
sw.js                 offline cache
manifest.webmanifest  home-screen install
```
