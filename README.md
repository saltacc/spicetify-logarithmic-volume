# Logarithmic Volume

A Spicetify extension that gives Spotify's volume slider finer control at low
levels.

Spotify's volume slider is linear, so small movements near the bottom can feel
too loud too quickly. This extension remaps the slider with a curve:

```js
actualVolume = sliderPosition ** 2
```

That keeps the top of the slider familiar while spreading out the quieter range:

```text
10% slider -> 1% volume
25% slider -> 6% volume
50% slider -> 25% volume
75% slider -> 56% volume
100% slider -> 100% volume
```

This exists because volume controls are moving numbers, but ears do not hear
numbers evenly. Human loudness perception is roughly logarithmic: a change in
speaker output does not feel like the same-size change in loudness at every
level. A curved slider gives more physical space to quiet volumes, where small
changes are easiest to notice.

## Install

Copy `logarithmic-volume.js` into your Spicetify `Extensions` folder, then run:

```sh
spicetify config extensions logarithmic-volume.js
spicetify apply
```

From this repo, the helper script does that for you:

```sh
npm run install:spicetify
```

## Development

```sh
npm run check
npm run publish:check
```

After editing the extension, reinstall it:

```sh
npm run install:spicetify
```

## Notes

The extension replaces Spotify's visible volume slider with a custom slider,
then writes the mapped value through Spicetify's playback API.

If Spotify changes its player bar markup, the extension may need its volume bar
selector updated in `logarithmic-volume.js`.
