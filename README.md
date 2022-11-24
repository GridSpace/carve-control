# carvera-control

a network proxy for Makera's Carvera that enables

* remote network access to the machine
* a web-based control interface
* protocol inspection
* command injection
* upload / download

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
carvera [...options]
   autocon=<0|1>   auto-connect when carvera found
   carvera=<info>  set machine targte as 'name,ip,port'
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

# using

connect with your browser to the port you specified on the command line.
usually this will be http://localhost:8001/

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
