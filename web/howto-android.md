## Installing Carvera Control on Android

- Install [termux](https://github.com/termux/termux-app/releases)
- Run [this script](howto-android.sh) inside termux (see below)
- Ppen Chrome to http://localhost:8001

## The Script

```
bash -c "$(curl -fsSL https://cc.grid.space/howto-android.sh)"
```

- Click to copy 
- Long press to paste into the termux command line

### The Script Summary

- Add and update sysmem pacakges
- Clone the carvera-control repo
- Run post-clone setup
- Install the pm2 process manager
- Start `carvera-control` using pm2
