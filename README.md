# Apex Online

Online open-wheel racing. Every player has their own screen; each one pairs a
phone as a steering wheel by scanning a QR code. Fictional drivers, teams and
circuits, so nothing here is licensed from anyone.

## Run it

```bash
npm install
npm start
```

The console prints two addresses:

```
Game screen : http://localhost:3000
On your LAN : http://192.168.x.x:3000
```

Open the game screen, enter a name, and hit **Create a race**. The lobby shows a
4-letter room code and a QR code. Other players open the same LAN address (or a
public URL if you tunnel it, see below) and join with that code.

## Playing

**Phone as controller.** Scan the QR code on your own lobby screen. The phone
pairs to *you*, not to the room, so each player scans their own screen. Hold the
phone in landscape, tilt to steer, and use the two pads for throttle and brake.
"Re-centre tilt" zeroes the steering at whatever angle you are holding, and
"Touch steering" swaps tilt for a drag bar if tilt is unavailable (iOS needs to
grant motion access; if it is declined the controller falls back automatically).

**No phone.** Arrow keys or WASD on the game screen. Space also brakes.

**Lobby settings** (host only): circuit, lap count, number of AI cars, and AI
pace. Everyone picks a driver; each driver can only be taken once, and their
stats differ slightly in acceleration, top speed and grip.

## Playing with people outside your network

The server is plain HTTP on one port, so any tunnel works:

```bash
npx localtunnel --port 3000      # or: ngrok http 3000, cloudflared tunnel ...
```

Give everyone the public URL. The QR code on the lobby always points at the LAN
address; when tunnelling, players should open the tunnel URL on their phone and
type in the code and key shown under the QR instead of scanning.

## How it fits together

```
server.js              rooms, lobby, race loop, snapshots at 20 Hz
sim.js                 physics and the bot driver (no networking; testable alone)
public/shared/tracks.js circuit and driver data, shared by server and browser
public/index.html      lobby, HUD and results
public/js/main.js      three.js scene, interpolation, input
public/controller.html the phone controller
```

The server is authoritative: phones and keyboards send only steering, throttle
and brake, the server runs the physics at 60 Hz, and clients render an
interpolated view about 100 ms in the past so other cars move smoothly.

Circuits are authored in polar form ("radius at this angle") which guarantees a
loop that never crosses itself. That matters because lap counting and race
position both come from projecting a car onto the centreline, and a crossing
would make a car near the intersection jump laps.

## Tuning

Grip, power, braking and the off-track penalty all live in `TUNE` at the top of
`sim.js`. To see what a change does, race the bots headlessly:

```bash
node tools/bench.js
```

It runs four bots over three laps of every circuit and reports lap times, how
much of the lap was spent off track, and wall contacts. Clean laps should show
0% off track; if a change sends that number up, the cars are washing wide.

```bash
node tools/validate-tracks.js
```

Checks every circuit for self-intersections, minimum corner radius and how close
opposite stretches come to each other. Run it after editing any layout.
