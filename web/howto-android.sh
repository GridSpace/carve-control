apt -y update
apt -y upgrade
apt -y install git nodejs vim
[ ! -d "carvera-control" ] && {
    git clone https://github.com/gridspace/carvera-control
    cd carvera-control
    npm i
    npm run bundle
    npm install -g pm2
    pm2 stop all
    pm2 delete all
    pm2 start lib/main.js
}
