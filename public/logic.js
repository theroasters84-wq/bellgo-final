const Logic = {
    socket: null,
    isFully: false, // Θα ανιχνεύσουμε αν είμαστε σε Fully Kiosk
    init: function() {
        const ua = navigator.userAgent.toLowerCase();
        this.isFully = ua.includes("fullykiosk") || ua.includes("webview");

        const status = document.getElementById('status');
        const log = (t) => status.innerHTML = t + "<br>" + status.innerHTML;

        log("🛠️ Εκκίνηση συστήματος...");
        
        // Socket μόνο για Fully Kiosk, αλλιώς Firebase + Socket
        if(this.isFully){
            log("📱 Fully Kiosk detected: Socket mode only");
            this.socket = io();
            this.setupSocket();
        } else {
            log("💻 Browser detected: Firebase + Socket mode");
            this.socket = io();
            this.setupSocket();
            // Firebase init (αν υπάρχει)
            if(typeof firebase !== 'undefined'){
                try { 
                    firebase.initializeApp(firebaseConfig);
                    log("✅ Firebase Initialized");
                } catch(e){ log("❌ Firebase init error: "+e.message); }
            }
        }

        // Start Watchdog
        Watchdog.start(this.isFully);
    },

    setupSocket: function() {
        const log = (t)=>document.getElementById('status').innerHTML=t+"<br>"+document.getElementById('status').innerHTML;

        this.socket.on('connect', ()=>log("✅ Socket Connected"));
        this.socket.on('ring-bell', ()=>Watchdog.triggerPanicMode());

        // Chat / staff updates
        this.socket.on('update-staff-list', (staff)=>log("👥 Staff Updated: "+staff.map(s=>s.username).join(", ")));
        this.socket.on('new-chat', (msg)=>log("💬 "+msg.username+": "+msg.message));
    },

    updateMediaSession: function(state){
        const silence = document.getElementById('silence');
        if(!('mediaSession' in navigator) || !silence) return;

        if(navigator.mediaSession.metadata === null){
            navigator.mediaSession.metadata = new MediaMetadata({
                title:"Silent Audio",
                artist:"Background Media",
                album:"System",
                artwork:[{src:"https://cdn-icons-png.flaticon.com/512/727/727245.png",sizes:"512x512",type:"image/png"}]
            });
        }

        navigator.mediaSession.playbackState = state;
        try {
            navigator.mediaSession.setPositionState({
                duration: silence.duration || 1,
                position: silence.currentTime || 0,
                playbackRate: silence.playbackRate || 1
            });
        } catch(e){}
    }
};
