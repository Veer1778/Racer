# Apex Online

Online open-wheel racing in the browser. Every player has their own screen and
pairs a phone as a steering wheel by scanning a QR code. Five circuits, three of
them the real layouts of well known venues, traced from open geographic data.

The grid is twenty invented drivers across ten teams, renameable in one file.

## Run it

```bash
npm install
npm start
```

The console prints a local address and a LAN address. Open either, enter a name,
hit **Create a race**, and share the 4-letter room code. Other players join from
their own machines with that code.

## Deploying

Any host that runs a persistent Node process works: Railway, Render, Fly.io, a
VPS. Serverless platforms (Vercel, Netlify functions, Lambda) do **not**, because
the server holds every room in memory and ticks physics 60 times a second.

Whatever the host, set:

- build command `npm install`
- start command `npm start` (not `node index.js`; the entry point is `server.js`)
- no root directory override, and leave `PORT` alone, the server reads it

Deploying gives you HTTPS, which iOS requires before it will grant a web page
access to the motion sensors, so tilt steering works on iPhones on a deployed
build but often not over plain-HTTP LAN.

## Playing

**Phone as controller.** Scan the QR code on your own lobby screen, not someone
else's: the code pairs a phone to one player. Hold the phone in landscape, tilt
to steer, two pads for throttle and brake. "Re-centre tilt" zeroes the steering
at whatever angle you're holding. "Touch steering" swaps tilt for a drag bar.
"Rejoin" puts a beached car back on track.

**No phone.** Arrow keys or WASD, space to brake, **R** to rejoin the track.

If tilt steers the wrong way on your handset, the controller has a
**Steering: normal / inverted** toggle and it remembers the choice. Which axis
reads as "roll the phone like a wheel" depends on which way the phone was turned
into landscape, and not every handset reports that the same way.

**Host settings:** circuit, laps, number of AI cars, AI pace. A car stuck against
a barrier for six seconds rejoins automatically.

## Pit stops

Every circuit has a real pit lane: a road of its own that branches off before
the start line, runs behind the barrier past the garages, and merges back after
it. It is not a painted strip inside the runoff.

**P** (or the Pit button on the phone) arms a stop. At the entry the car peels
onto the lane road, the limiter comes on at 80 km/h, and it brakes to a stop on
its own numbered box, where the crew come out, work on the car and step back as
the jack drops. Pressing P again before the entry calls it off; so does simply
driving down the entry road, which arms a stop without the key. Miss the entry
and the lane lets you go rather than dragging you sideways into it.

A stop costs about 20-25 seconds all in and gives fresh tyres, plus most of any
damage repaired. Pick the compound for the *next* stop from the lobby's tyre
buttons at any time during the race.

Tyre life is tuned so the compound is a real choice on every circuit, roughly:

| | soft | medium | hard |
|---|---|---|---|
| grip | +7% | — | −6% |
| lasts | ~half a stint | ~a stint | ~1.6 stints |

On a standard race length that is two stops on softs, one on mediums, and none
on hards at a lasting pace deficit.

## Frame rate

The renderer gives things up until it can hold a frame rate, and it does it on
the race you are in rather than the next one. Three tiers — full, eased, reduced
— trade the shadow pass, the environment lighting and the drawing resolution in
that order, measured over a span of *time* rather than a count of frames so a
slow machine is not the last to find out it is slow. A change says so on screen
and recompiles the shaders in one deliberate pause instead of leaking the cost
over the next forty frames.

## Circuits

| Circuit | Length | Notes |
|---|---|---|
| Sakhir | 5.3 km | Bahrain layout, run at night |
| Silverstone | 5.8 km | fast and open |
| Spa | 6.9 km | longest lap in the game |
| Kestrel Ring | 1.8 km | invented, long straights |
| Cobalt Bay | 1.3 km | invented street circuit |

Real layouts come from the open `f1-circuits` GeoJSON dataset, projected to
metres, smoothed and resampled. `tools/convert` is not shipped; the finished
centrelines live in `public/shared/circuits.js`.

## Renaming drivers and teams

Everything is in `public/shared/drivers.js`. `TEAMS` holds ten teams (`color` is
the car body and the UI accent, `trim` is the wings, stripes and wheel rims).
`ROSTER` holds twenty drivers as `[team, number, name, accel, top, grip, helmet]`.
The three figures are multipliers around 1.0, so 1.05 top with 0.95 accel is a
car that is fast down the straight and slow off the line; stay inside roughly
0.94 to 1.06 or the grid stops being competitive.

Change a name and the lobby, HUD, timing screen and AI all follow: driver ids
are derived from the name, and nothing else hardcodes a driver.

The roster ships invented. Real team names, driver names and liveries are
trademarks and likeness rights that a published game licences, so swapping them
in is a decision for whoever ships it, not a default.

## How it fits together

```
server.js               rooms, lobby, the 60 Hz race loop, 30 Hz snapshots
public/shared/sim.js    physics and the bot driver, imported by BOTH sides
public/shared/tracks.js circuit geometry and centreline projection
public/shared/drivers.js the grid: teams, drivers, liveries
public/shared/circuits.js real circuit centrelines
public/js/main.js       networking, prediction, HUD
public/js/scene.js      three.js world and the blocky car model
public/controller.html  the phone controller
tools/                  headless benchmarks: bench.js, pitcheck.js, validate-tracks.js
```

### Why it does not feel laggy

The server is authoritative, but the browser imports the *same* `sim.js` and
predicts the local car itself, so steering responds on the frame you press it
rather than after a round trip. Every snapshot carries the sequence number of
the last input the server applied; the client rewinds to the server's state and
replays the inputs it hasn't acknowledged yet. Residual error is eased out over
about a third of a second instead of snapping.

Two rules matter here, and both were bugs first:

- Anything time-based runs off measured elapsed time, never per frame. The
  prediction loop uses a fixed-timestep accumulator and the camera eases with
  `1 - exp(-dt / tau)`. Per-frame constants look fine at 60 fps and fall apart
  at 20, where they showed up as the car drifting metres off and the camera
  trailing out of shot.
- A phone sends its input straight to the server, so that leg cannot be
  predicted away. When a controller is paired the client extrapolates the last
  known input by half a round trip instead.

WebSocket keepalives run both ways every few seconds. Hosting proxies silently
drop idle sockets, which leaves the page sending into a dead connection with no
error, looking exactly like frozen controls.

### Lap timing on a real layout

Position and lap count come from projecting the car onto the centreline, and the
search is windowed around the sample the car was on last tick. A global nearest
point search jumps to the wrong part of the lap wherever a circuit runs back
alongside itself, which real layouts do constantly.

## Tuning

Grip, power, braking and the off-track penalty live in `TUNE` at the top of
`public/shared/sim.js`. To see what a change does, race the bots headlessly:

```bash
node tools/bench.js            # lap times, time spent off track, wall contacts
node tools/validate-tracks.js  # self-intersections, corner radii, spacing
```

Clean laps should show close to 0% off track and one wall contact (the start).
If off-track climbs, the cars are washing wide and the grip numbers moved too
far. Reference lap times for the bots at full pace: Sakhir ~105 s,
Silverstone ~111 s, Spa ~132 s.

`window.__apex.state` in the browser console reports the predicted car, the
camera, and the current prediction error in metres.
