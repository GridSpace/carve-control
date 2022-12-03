(function() {

    const vars = {
        anchor: 0,
        canvas: undefined
    };

    const { PerspectiveCamera, WebGLRenderer, WebGL1Renderer, Scene, Group, Color } = THREE;
    const { AmbientLight, Mesh, BoxGeometry, MeshMatcapMaterial, DoubleSide } = THREE;
    const { BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial } = THREE;
    const { platform, vendor } = navigator;

    const SCENE = new Scene();
    const WORLD = new Group();
    const PI2 = Math.PI / 2;
    const matcap = new MeshMatcapMaterial({
        flatShading: true,
        color: 0xeeeeee,
        side: DoubleSide
    });

    function three_setup() {
        const canvas = vars.canvas = $('canvas');

        function width() { return canvas.clientWidth }
        function height() { return canvas.clientHeight }
        function aspect() { return width() / height() }

        WORLD.rotation.x = -PI2;
        SCENE.add(WORLD);

        canvas.style.width = width();
        canvas.style.height = height();

        // workaround for https://bugs.chromium.org/p/chromium/issues/detail?id=1321452
        // and android requires older rendered to avoid visual Z order artifacts
        const Renderer =
            (platform.indexOf('Linux') >= 0) ||
            (platform === 'MacIntel' && vendor.indexOf('Google') >= 0) ?
            WebGL1Renderer : WebGLRenderer;

        renderer = new Renderer({
            antialias: true,
            preserveDrawingBuffer: true,
            logarithmicDepthBuffer: true
        });
        renderer.localClippingEnabled = true;
        camera = new PerspectiveCamera(35, aspect(), 0.1, 100000);

        camera.position.set(0, 600, 0);
        canvas.appendChild(renderer.domElement);
        renderer.setSize(width(), height());

        viewControl = new Orbit(camera, canvas, (position, moved) => {
            // todo
        }, (val) => {
            // todo
        });

        viewControl.noKeys = true;
        viewControl.maxDistance = 1000;
        viewControl.reverseZoom = true;

        SCENE.add(new AmbientLight(0x707070));

        function animate() {
            requestAnimationFrame(animate);
            renderer.render(SCENE, camera);
        }

        function reset_home() {
            console.trace('reset');
            viewControl.reset();
            viewControl.update();
        }

        window.addEventListener('resize', () => {
            canvas.style.width = width();
            canvas.style.height = height();
            renderer.setSize(width(), height());
        });

        window.addEventListener('keypress', ev => {
            if (ev.code === 'KeyH') {
                reset_home();
            }
        });

        // window.addEventListener('dblclick', ev => {
        //     reset_home();
        // });

        animate();
        viewControl.update();
    }

    function build_setup() {
        const { parse, newGeometry } = exports.obj;
        fetch('carvera.obj')
        .then(r => r.text())
        .then(obj => parse(obj))
        .then(obj => {
            const mesh = vars.mesh = { };
            for (let [ name, verts ] of Object.entries(obj)) {
                const color = {
                    'base':   0xdddddd,
                    'plate':  0x999999,
                    'corner': 0xeeeeee,
                    'tower':  0xf3f3f3,
                }[name];
                const geo = newGeometry(verts.map(v => v * 1000));
                const mat = matcap.clone();
                const meh = new Mesh(geo, mat);
                mat.color = new Color(color);
                geo.computeBoundingBox();
                WORLD.add(mesh[name] = meh);
            }
            const { corner } = mesh;
            corner.geometry.translate(0,0,0.01);
            corner.material.transparent = true;
            corner.material.opacity = 0.4;
        });
    }

    function bind_ui() {
        for (let radio of [0,1,2,3]) {
            $(`ank${radio}`).onchange = update_anchor;
        }
        // bind "+" "-" buttons to their input fields
        for (let b of [...document.getElementsByTagName('BUTTON')]) {
            let target;
            let diff = 0;
            if (b.id.indexOf('-dn') > 0) {
                target = $(b.id.substring(0,b.id.length - 3));
                diff = -1;
            }
            if (b.id.indexOf('-up') > 0) {
                target = $(b.id.substring(0,b.id.length - 3));
                diff = 1;
            }
            if (target) {
                b.onclick = () => {
                    target.value = Math.max(0,Math.min(Infinity,parseFloat(target.value)+diff));
                    update_render();
                };
            }
        }
        $('probe-ank').onclick =
        $('probe-grid').onclick =
        $('run-box').onclick = update_render;
        $('run-start').onclick = run_start;
        $('run-cancel').onclick = run_cancel;
    }

    function update_anchor() {
        let sel = 0;
        for (let radio of [0,1,2,3]) {
            if ($(`ank${radio}`).checked) {
                sel = radio;
            }
        }
        vars.anchor = sel;
        update_render();
    }

    function update_render() {
        // log('update render');
        const { mapo, bounds } = config;
        if (!(mapo && bounds)) {
            return;
        }
        const { mesh } = vars;
        const { corner } = mesh;
        const { coordinate } = mapo;
        const { anchor1_x, anchor1_y, anchor_width } = coordinate;
        const anko_x = parseFloat($('anko-x').value || 0);
        const anko_y = parseFloat($('anko-y').value || 0);
        const off = vars.anchor_offset = {
            x: anchor1_x + anko_x,
            y: anchor1_y + anko_y,
            z: 0,
            use: true
        };
        switch (vars.anchor) {
            case 0:
                off.use = false;
                corner.position.set(0, 0, 0);
                break;
            case 1:
                corner.position.set(0, 0, 0);
                break;
            case 2:
                const { anchor2_offset_x, anchor2_offset_y } = coordinate;
                corner.position.set(anchor2_offset_x, anchor2_offset_y, 0);
                off.x += anchor2_offset_x;
                off.y += anchor2_offset_y;
                break;
            case 3:
                const { rotation_offset_x, rotation_offset_y, rotation_offset_z } = coordinate;
                corner.position.set(rotation_offset_x, rotation_offset_y, rotation_offset_z);
                off.x += rotation_offset_x;
                off.y += rotation_offset_y;
                off.z += rotation_offset_z;
                break;
        }
        WORLD.remove(vars.build);
        const group = vars.build = new Group();
        const cmin = corner.geometry.boundingBox.min;
        const cpos = corner.position;
        group.position.set(
            cpos.x + cmin.x + anchor_width + 1 + anko_x,
            cpos.y + cmin.y + anchor_width + 1 + anko_y,
            cpos.z + cmin.z
        );
        const { span, min } = bounds;
        const bnds = createBounds(span.X, span.Y, span.Z);
        // bnds.position.set(min.X, min.Y, min.Z);
        group.add(bnds);
        if ($('probe-grid').checked) {
            const px = parseInt($('probe-x').value || 0) - 1;
            const py = parseInt($('probe-y').value || 0) - 1;
            for (let i = 0; i <= span.X; i += span.X / px) {
                for (let j = 0; j <= span.Y; j += span.Y / py) {
                    group.add(createSpot(i, j, 0));
                }
            }
        } else if ($('probe-ank').checked) {
            group.add(createSpot(0, 0, 0));
        }
        if ($('run-box').checked) {
            group.add(createBox(span.X, span.Y, span.Z));
        }
        WORLD.add(group);
    }

    function createBox(x, y, z) {
        const geo = new BufferGeometry();
        const mat = new LineBasicMaterial();
        mat.color = new Color(0xff0000);
        geo.setAttribute('position', new BufferAttribute(new Float32Array([
            0, 0, z,   x, 0, z,
            0, 0, z,   0, y, z,
            x, 0, z,   x, y, z,
            0, y, z,   x, y, z
        ]), 3));
        return new LineSegments(geo, mat);
    }

    function createBounds(x, y, z) {
        x /= 2, y /= 2, z /= 2;
        const geo = new BufferGeometry();
        const mat = new LineBasicMaterial();
        mat.color = new Color(0x00ff00);
        geo.setAttribute('position', new BufferAttribute(new Float32Array([
            -x, -y, -z,   x, -y, -z,
            -x, -y, -z,  -x,  y, -z,
            -x, -y, -z,  -x, -y,  z,
             x,  y,  z,  -x,  y,  z,
             x,  y,  z,   x, -y,  z,
             x,  y,  z,   x,  y, -z,
            -x,  y, -z,  -x,  y,  z,
            -x, -y,  z,  -x,  y,  z,
            -x, -y,  z,   x, -y,  z,
             x, -y,  z,   x, -y, -z,
             x,  y, -z,   x, -y, -z,
             x,  y, -z,  -x,  y, -z,
        ]), 3));
        const lines = new LineSegments(geo, mat);
        geo.translate(x, y, z);
        return lines;
    }

    function createSpot(x,y,z) {
        const box = new BoxGeometry();
        const mat = matcap.clone();
        mat.color = new Color(0xff0000);
        const meh = new Mesh(box, mat);
        meh.scale.set(5, 5, 5);
        meh.position.set(x, y, z);
        return meh;
    }

    function run_start() {
        if (!config.selected_file) {
            log('no file selected');
            return;
        }
        const { mapo, bounds } = config;
        if (!bounds) {
            log('missing bounds');
            return;
        }
        update_render();
        const off = vars.anchor_offset;
        const g10 = [ 'G10', 'L2', 'P0', `X:${off.x}`, `Y:${off.y}`, `Z:${off.z}` ];
        const m495 = [ 'M495', `X${bounds.min.X}`, `Y${bounds.min.Y}` ];
        if ($('run-box').checked) {
            m495.push(`C${bounds.span.X}`, `D${bounds.span.Y}`);
        }
        if ($('probe-ank').checked) {
            // todo: gather probe offset from part origin
            m495.push('O0', 'F0');
        }
        if ($('probe-grid').checked) {
            // mesh z probe box size
            m495.push(`A${bounds.span.X}`, `B${bounds.span.Y}`);
            // mesh x,y probe points
            const IX = parseInt($('probe-x').value);
            const JY = parseInt($('probe-y').value);
            m495.push(`I${IX}`, `J${JY}`);
            // todo: gather mesh z clearance between points
            m495.push(`H3`);
        }
        log({ g10, m495 });
        const { dir, file } = config.selected_file;
        log('run selected', dir, file);
        // run(`${dir}${file}`);
    }

    function run_cancel() {
        hide();
    }

    function show() {
        $('runit').style.zIndex = 100;
    }

    function hide() {
        $('runit').style.zIndex = -100;
    }

    self.canvas_setup = () => {
        three_setup();
        build_setup();
        bind_ui();
        update_render();
    };

    exports.run_check = () => {
        let canrun = (
            config.status.state === 'Idle' &&
            config.selected_file &&
            config.bounds &&
            config.mapo
        );
        $('run-start').disabled = !canrun;
        $('file-run').disabled =
        $('file-load').disabled =
        $('file-delete').disabled = !config.selected_file;
        update_render();
        return canrun;
    };

    exports.run_setup = () => {
        if (config.selected_file) {
            show();
        }
    };

})();
