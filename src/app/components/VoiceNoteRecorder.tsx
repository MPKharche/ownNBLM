import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Trash2, Check, Loader2 } from 'lucide-react';

interface VoiceNoteRecorderProps {
  onSave: (transcript: string, audioBlob?: Blob) => void;
  onCancel: () => void;
}

export function VoiceNoteRecorder({ onSave, onCancel }: VoiceNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initialize Web Speech API for speech-to-text
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        setTranscript(prev => prev + finalTranscript || interimTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
      };
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);

      // Start speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please grant permission.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const playRecording = () => {
    if (audioBlob) {
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audio.play();
    }
  };

  const handleSave = () => {
    if (transcript.trim()) {
      onSave(transcript.trim(), audioBlob || undefined);
    }
  };

  const handleDiscard = () => {
    setAudioBlob(null);
    setTranscript('');
    setDuration(0);
    audioChunksRef.current = [];
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">Voice Note</h3>
        <button
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Recording Controls */}
      {!audioBlob && (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isRecording ? (
              <Square className="w-6 h-6 text-white" />
            ) : (
              <Mic className="w-6 h-6 text-white" />
            )}
          </button>

          {isRecording && (
            <div className="text-sm text-muted-foreground">
              Recording... {formatDuration(duration)}
            </div>
          )}

          {!isRecording && duration === 0 && (
            <div className="text-xs text-muted-foreground text-center">
              Click to start recording
            </div>
          )}
        </div>
      )}

      {/* Transcript Display */}
      {transcript && (
        <div className="mt-3 p-3 bg-muted/30 rounded border border-border">
          <div className="text-xs text-muted-foreground mb-1">Transcript:</div>
          <div className="text-sm text-foreground whitespace-pre-wrap">
            {transcript}
          </div>
        </div>
      )}

      {/* Playback Controls */}
      {audioBlob && !isRecording && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <button
            onClick={playRecording}
            className="p-2 bg-accent hover:bg-accent/80 rounded transition-colors"
            title="Play recording"
          >
            <Play className="w-4 h-4 text-foreground" />
          </button>

          <button
            onClick={handleDiscard}
            className="p-2 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded transition-colors"
            title="Discard"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleSave}
            disabled={!transcript.trim()}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Save Note
          </button>
        </div>
      )}

      {/* Manual Transcript Edit */}
      {audioBlob && !isRecording && (
        <div className="mt-3">
          <label className="text-xs text-muted-foreground mb-1 block">
            Edit transcript if needed:
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={3}
            placeholder="Edit the transcription..."
          />
        </div>
      )}

      {isTranscribing && (
        <div className="flex items-center justify-center gap-2 mt-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Transcribing...
        </div>
      )}

      {!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) && (
        <div className="mt-3 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
          ⚠️ Speech-to-text not supported in this browser. You can still record audio and type notes manually.
        </div>
      )}
    </div>
  );
}
