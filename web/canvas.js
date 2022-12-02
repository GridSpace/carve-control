(function() {

    const vars = {
        anchor: 0,
        canvas: undefined
    };

    const { PerspectiveCamera, WebGLRenderer, WebGL1Renderer, Scene, Group } = THREE;
    const { AmbientLight, Mesh, BoxGeometry, MeshMatcapMaterial, DoubleSide } = THREE;
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
            viewControl.reset();
            viewControl.update();
        }

        window.addEventListener('resize', () => {
            canvas.style.width = width();
            canvas.style.height = height();
            renderer.setSize(width(), height());
        });

        window.addEventListener('keypress', ev => {
            if (ev.code = 'KeyH') {
                reset_home();
            }
        });

        window.addEventListener('dblclick', ev => {
            reset_home();
        });

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
                const geo = newGeometry(verts);
                const mat = matcap.clone();
                const meh = new Mesh(geo, mat);
                meh.scale.set(1000,1000,1000);
                mat.color = new THREE.Color(color);
                WORLD.add(mesh[name] = meh);
            }
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
        const { coordinate } = mapo;
        const { anchor1_x, anchor1_y, anchor_width } = coordinate;
        const off = vars.anchor_offset = {
            x: anchor1_x + parseFloat($('anko-x').value),
            y: anchor1_y + parseFloat($('anko-y').value),
            z: 0,
            use: true
        };
        switch (vars.anchor) {
            case 0:
                off.use = false;
                mesh.corner.position.set(0, 0, 0);
                break;
            case 1:
                mesh.corner.position.set(0, 0, 0);
                break;
            case 2:
                const { anchor2_offset_x, anchor2_offset_y } = coordinate;
                mesh.corner.position.set(anchor2_offset_x, anchor2_offset_y, 0);
                off.x += anchor2_offset_x;
                off.y += anchor2_offset_y;
                break;
            case 3:
                const { rotation_offset_x, rotation_offset_y, rotation_offset_z } = coordinate;
                mesh.corner.position.set(rotation_offset_x, rotation_offset_y, rotation_offset_z);
                off.x += rotation_offset_x;
                off.y += rotation_offset_y;
                off.z += rotation_offset_z;
                break;
        }
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

    exports.run_setup = () => {
        if (config.selected_file) {
            show();
        }
    };

})();
