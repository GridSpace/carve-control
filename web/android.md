# Installing Carvera Control on Android

- Install [termux](https://github.com/termux/termux-app/releases). If unsure, use the [universal](https://github.com/termux/termux-app/releases/download/v0.118.0/termux-app_v0.118.0+github-debug_universal.apk) package
- Run [this script](android.sh) inside termux (see below)
- Open Chrome to http://localhost:8001#install

## The Script

```
bash -c "$(curl -fsSL https://cc.grid.space/android.sh)"
```

- Click / Tap text above &uparrow; to copy
- Long press to paste into the termux command line
- Hit [`Enter`] to run script

## Script Actions

- Add and update sysmem pacakges
- Clone the carvera-control repo
- Run post-clone setup
- Install the pm2 process manager
- Start `carvera-control` using pm2

## And then

- pm2 starts the process in the background
- `pm2 status` to see the process status
- `pm2 log` to tail the process log
- `pm2 stop all` to stop the process
