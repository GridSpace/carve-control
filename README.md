# carve-control

a network proxy for Makera's Carvera that enables

* remote network access to the machine
* a web-based control interface
* protocol inspection
* command injection
* upload / download

# install nodejs

https://nodejs.org/en/download/

# first-time setup

```
git clone https://github.com/GridSpace/carvera-control
cd carvera-control
npm install
node lib/main
```

# starting

there are many command line options depending on your needs

```
cctrl [...options]
   autocon=<0|1>   auto-connect when carvera found on network
   carvera=<info>  set carvera nework target as 'name,ip,port'
   cmdline=<0|1>   cmd-line input to carvera channel
   locate=<0|1>    listener to locate carvera on network
   proxy=<0|1>     accept connections for connected carvera
   spoof=<0|1>     announce this process as a carvera machine
   quiet=<0|1>     enable/disable debug logging
   web=<0|1>       enable/disable web server process
   webport=#       port for http server (default: 8001)
   websport=#      port for https server (requires cert gen)
   webskey=<file>  file containing key.pem for https
   webscert=<file> file containing cert.pem for https
   help            this menu
```

a typical way to start which would auto-connect to your carvera when
it's detected on the network and present a web interface on port 8001

```
node lib/main.js
```

if you want to start the controller in an unconnected mode which would
allow Carvera's official controller to see it is a proxy

```
node lib/main autocon=0
```

either way, Carvera's software will see Carve Control as your machine's
name prefixed by "proxy" -- that allows you to do protocol inspections
or, perhaps more useful, connect to a Carvera machine on a non-local
network or on a network where broadcasts are blocked.

# accessing

connect with your browser to the port you specified on the command line.
usually this will be http://localhost:8001/

there is a live version hosted at https://cc.grid.space which should allow
usb / serial access from browsers that support it (Chrome, Edge).

# serial / usb

the web interface can use your usb / serial interface to connect directly
to the machine if your browser supports it. some browsers allow usb / serial
when connected to `localhost` and others require the web server to be on a
secure port (thus the options above). if you need a secure endpoint, run
these two commands:

```
npm run genssl
npm run bundle
```

`genssl` will produce self-signed certs and `bundle` will produce a worker
javascript bundle that can talk to the serial port in the browser. you then
need to add the `webskey` and `webscert` command line options pointing to
the generated ssl files.

# android

* follow [these instructions](https://cc.grid.space/android.html) to install on android tablets
* open the link in chrome on your tablet to facilitate copying the script
* serial still isn't working 100% on Android. working on a library to solve this
* network / tcp is 10x - 100x faster than serial anyway and more reliable
