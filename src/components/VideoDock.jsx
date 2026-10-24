import { Video, Camera, CameraOff, Mic, MicOff, PhoneOff } from 'lucide-react';
import { useCanvas } from '../context/CanvasContext';

const BTN = 'w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center transition-all';
const BTN_OFF = 'w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center transition-all shadow-md';

export default function VideoDock() {
  const { callActive, isCamEnabled, isMicEnabled, startVideoCall, stopVideoCall, toggleCamera, toggleMicrophone } = useCanvas();
  const disabledCls = callActive ? '' : ' opacity-50 cursor-not-allowed';

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl px-4 py-2 rounded-full border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
      {!callActive && (
        <button
          className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all active:scale-95 shadow-md"
          title="Start Video Call"
          onClick={startVideoCall}
        >
          <Video className="w-5 h-5" />
        </button>
      )}
      <button
        className={(isCamEnabled ? BTN : BTN_OFF) + disabledCls}
        disabled={!callActive}
        title="Toggle Camera"
        onClick={toggleCamera}
      >
        {isCamEnabled ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
      </button>
      <button
        className={(isMicEnabled ? BTN : BTN_OFF) + disabledCls}
        disabled={!callActive}
        title="Toggle Voice/Mic"
        onClick={toggleMicrophone}
      >
        {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>
      {callActive && (
        <button
          className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all active:scale-95 shadow-md"
          title="End Call"
          onClick={stopVideoCall}
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}