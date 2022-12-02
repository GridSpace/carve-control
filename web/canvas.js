(function() {

    const vars = {
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
            const meshes = vars.meshes = { };
            for (let [ name, verts ] of Object.entries(obj)) {
                const color = {
                    'base':   0xdddddd,
                    'plate':  0x999999,
                    'corner': 0xeeeeee,
                    'tower':  0xf3f3f3,
                }[name];
                const geo = newGeometry(verts);
                const mat = matcap.clone();
                const mesh = new Mesh(geo, mat);
                mesh.scale.set(1000,1000,1000);
                mat.color = new THREE.Color(color);
                meshes[name] = mesh;
                WORLD.add(mesh);
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
    }

    self.canvas_setup = () => {
        three_setup();
        build_setup();
        bind_ui();
        update_render();
    };

})();
