# bash in termux lives in a non-standard location, so this does not
# start with the standard hash-bang shell designation

# bring packages up-to-date
# install git, node dependencies

apt -y update
apt -y upgrade
apt -y install git nodejs

# if the repo hasn't been cloned before, clone it now

[ ! -d "carvera-control" ] && {
    git clone https://github.com/gridspace/carvera-control
}

# update the repo, setup dependencies, start it up
# this will delete old pm2 app settings and create new ones

[ -d "carvera-control" ] && {
    cd carvera-control
    git pull
    npm i
    npm run bundle
    npm install -g pm2
    pm2 stop all
    pm2 delete all
    pm2 start lib/main.js
    pm2 save
}
