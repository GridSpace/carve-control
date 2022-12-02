(function() {

function parseAsync(text) {
    return new Promise((resolve,reject) => {
        resolve(parse(text));
    });
}

function parse(text) {
    let lines = text.split('\n').map(l => l.trim());
    let objs = { };
    let verts = [];
    let faces = [];

    for (let line of lines) {
        let toks = line.split(' ');
        switch (toks.shift()) {
            case 'v':
                let v = toks.map(v => parseFloat(v)).slice(0,3);
                verts.push(v);
                break;
            case 'f':
                let tok = toks.map(f => parseInt(f.split('/')[0]));
                // add support for negative indices (offset from last vertex array point)
                faces.push(...verts[tok[0]-1]);
                faces.push(...verts[tok[1]-1]);
                faces.push(...verts[tok[2]-1]);
                break;
            case 'g':
                objs[toks[0] || 'unnamed'] = faces = [];
                break;
        }
    }
    return objs;
}

function newGeometry(verts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    return geo;
}

exports.obj = {
    parse,
    parseAsync,
    newGeometry
};

})();
