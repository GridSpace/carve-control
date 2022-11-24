class LineBuffer {

    constructor(stream, online) {
        if (!stream) {
            throw "missing stream";
        }

        this.enabled = true;
        this.buffer = null;
        this.stream = stream;
        this.online = online;

        this.onData = (data) => {
            this.nextData(data);
        };

        this.onReadable = () => {
            let data;
            while (data = this.stream.read()) {
              this.nextData(data);
            }
        };

        if (online) {
            stream.on("readable", this.onReadable);
        } else {
            stream.on("data", this.onData);
        }
    }

    nextData(data) {
        if (this.buffer) {
            this.buffer = Buffer.concat([this.buffer, data]);
        } else {
            this.buffer = data;
        }
        this.nextLine();
    }

    nextLine() {
        if (!this.enabled) {
            return;
        }
        let left = 0;
        const data = this.buffer;
        const cr = data.indexOf("\r");
        const lf = data.indexOf("\n");
        if (lf && cr + 1 == lf) { left = 1 }
        if (lf >= 0) {
            let slice = data.slice(0, lf - left);
            if (this.online) {
                this.online(slice);
            } else {
                this.stream.emit("line", slice);
            }
            this.buffer = data.slice(lf + 1);
            this.nextLine();
        }
    }

    detach() {
        this.stream.removeListener("data", this.onData);
        this.stream.removeListener("readable", this.onReadable);
    }

}

module.exports = LineBuffer;
