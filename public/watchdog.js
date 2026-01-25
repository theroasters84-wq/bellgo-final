const Watchdog = {
    interval: null,
    panicInterval: null,
    isRinging: false,
    wakeLock: null,

    start: function(isFully){
        const log = (t)=>document.getElementById('status').innerHTML=t+"<br>"+document.getElementById('status').innerHTML;

        log("🛡️ Watchdog Active");
        this.ensureAudioPlaying();
        this.requestWakeLock();

        document.addEventListener('visibilitychange', ()=>{
            if(document.visibilityState==='visible'){
                this.requestWakeLock();
                this.ensureAudioPlaying();
                if(typeof Logic!=='undefined'&&!this.isRinging) Logic.updateMediaSession('playing');
            }
        });

        this.interval = setInterval(()=>{
            this.ensureAudioPlaying();
            this.requestWakeLock();
            if(typeof Logic!=='undefined'&&!this.isRinging) Logic.updateMediaSession('playing');
        },5000);
    },

    ensureAudioPlaying: function(){
        const silence = document.getElementById('silence');
        if(silence && silence.paused && !this.isRinging) silence.play().catch(()=>{});
    },

    requestWakeLock: async function(){
        if('wakeLock' in navigator && !this.wakeLock){
            try { this.wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
        }
    },

    triggerPanicMode: function(){
        if(this.isRinging) return;
        this.isRinging = true;

        const silence = document.getElementById('silence');
        if(silence) silence.pause();

        const audio = document.getElementById('siren');
        if(audio){ audio.currentTime=0; audio.loop=true; audio.play().catch(()=>{}); }

        document.getElementById('alarmScreen').style.display='flex';

        this.panicInterval = setInterval(()=>{
            if(!this.isRinging) return;
            if(navigator.vibrate) navigator.vibrate([1000,50,1000]);
            window.focus();
        },500);
    },

    stopPanicMode: function(){
        this.isRinging=false;
        if(this.panicInterval) clearInterval(this.panicInterval);

        const audio = document.getElementById('siren');
        if(audio){ audio.pause(); audio.currentTime=0; audio.loop=false; }

        if(navigator.vibrate) navigator.vibrate(0);
        document.getElementById('alarmScreen').style.display='none';

        this.ensureAudioPlaying();
        if(typeof Logic!=='undefined') Logic.updateMediaSession('playing');
    }
};
