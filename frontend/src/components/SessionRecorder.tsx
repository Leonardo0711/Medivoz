import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Activity, Mic, Radio, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { logger } from "@/utils/logger";
import { RecordingControls } from "./session/RecordingControls";
import { AudioFileUpload } from "./session/AudioFileUpload";
import { useSessionRecorder } from "@/hooks/use-session-recorder";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useAudioTranscription } from "@/hooks/use-audio-transcription";

interface SessionRecorderProps {
  onTranscriptionReady: (transcription: string) => void;
  patientId?: string | null;
  isPatientSelected: boolean;
  onSessionCreated?: (sessionId: string) => void;
}

export const SessionRecorder = memo(
  function SessionRecorder({
    onTranscriptionReady,
    patientId,
    isPatientSelected,
    onSessionCreated,
  }: SessionRecorderProps) {
    const [audioTranscription, setAudioTranscription] = useState<string>("");
    const [activeTab, setActiveTab] = useState<string>("record");
    const [isUploadTranscribing, setIsUploadTranscribing] = useState(false);
    const audioProcessingRef = useRef(false);

    const {
      sessionId,
      dbSessionId,
      recordingTime,
      generateSessionId,
      handleStartRecording: startSessionRecording,
      handleStopRecording: stopSessionRecording,
      updateSessionWithTranscription,
    } = useSessionRecorder({
      patientId,
      isPatientSelected,
      onTranscriptionReady,
      onSessionCreated,
    });

    const {
      isRecording: isAudioRecording,
      isPaused: isAudioPaused,
      isTranscribing,
      audioURL,
      audioWaveform,
      permissionDenied,
      requestPermission,
      startRecording: startAudioRecording,
      pauseRecording: pauseAudioRecording,
      resumeRecording: resumeAudioRecording,
      stopRecording: stopAudioRecording,
      transcribeAudio,
    } = useAudioRecorder({
      onTranscriptionComplete: (transcription) => {
        logger.log(
          "Transcription received in callback:",
          transcription ? `${transcription.substring(0, 100)}...` : "Empty"
        );
        if (!transcription) {
          toast.error("No se pudo obtener la transcripcion");
          audioProcessingRef.current = false;
          return;
        }

        setAudioTranscription(transcription);
        updateSessionWithTranscription(transcription, dbSessionId || undefined);
        onTranscriptionReady(transcription);
        audioProcessingRef.current = false;
      },
    });

    const { transcribeAudio: transcribeUploadedAudio } = useAudioTranscription();

    useEffect(() => {
      if (audioTranscription) {
        onTranscriptionReady(audioTranscription);
      }
    }, [audioTranscription, onTranscriptionReady]);

    const handleStartRecording = useCallback(() => {
      audioProcessingRef.current = false;
      startSessionRecording();
      startAudioRecording();
    }, [startSessionRecording, startAudioRecording]);

    const handlePauseRecording = useCallback(() => {
      if (isAudioRecording && !isAudioPaused) {
        pauseAudioRecording();
      }
    }, [isAudioRecording, isAudioPaused, pauseAudioRecording]);

    const handleResumeRecording = useCallback(() => {
      if (isAudioRecording && isAudioPaused) {
        resumeAudioRecording();
      }
    }, [isAudioRecording, isAudioPaused, resumeAudioRecording]);

    const handleStopRecording = useCallback(async () => {
      if (audioProcessingRef.current) {
        logger.log("Audio is already being processed");
        return;
      }

      audioProcessingRef.current = true;

      if (isAudioRecording) {
        await stopAudioRecording();
      }

      stopSessionRecording();

      setTimeout(async () => {
        try {
          logger.log("Starting transcription...");
          const transcription = await transcribeAudio({ consultaId: dbSessionId });
          logger.log("Transcription result:", transcription ? "Received" : "Empty");

          if (!transcription) {
            audioProcessingRef.current = false;
            toast.error("No se pudo obtener la transcripcion. Intente grabar nuevamente.");
          }
        } catch (error) {
          logger.error("Error during transcription:", error);
          toast.error("Error al transcribir el audio");
          audioProcessingRef.current = false;
        }
      }, 1500);
    }, [isAudioRecording, stopAudioRecording, stopSessionRecording, transcribeAudio]);

    const handleFileUpload = useCallback(
      async (file: File) => {
        if (!isPatientSelected) {
          toast.error("Primero selecciona un paciente");
          return;
        }

        setIsUploadTranscribing(true);
        toast.info("Procesando archivo de audio...");

        try {
          let currentDbSessionId = dbSessionId;

          if (!sessionId || !dbSessionId) {
            const result = await generateSessionId();
            if (!result) {
              toast.error("Error al crear la sesion");
              setIsUploadTranscribing(false);
              return;
            }
            currentDbSessionId = result.dbSessionId;
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          const audioBlob = new Blob([await file.arrayBuffer()], { type: file.type });
          const transcription = await transcribeUploadedAudio(audioBlob, {
            consultaId: currentDbSessionId,
          });

          if (transcription && currentDbSessionId) {
            await updateSessionWithTranscription(transcription, currentDbSessionId);
            setAudioTranscription(transcription);
            onTranscriptionReady(transcription);
            toast.success("Transcripcion completada exitosamente");
          } else if (!transcription) {
            toast.error("No se pudo obtener la transcripcion del audio");
          }
        } catch (error) {
          logger.error("Error transcribing uploaded file:", error);
          toast.error("Error al transcribir el archivo");
        } finally {
          setIsUploadTranscribing(false);
        }
      },
      [
        isPatientSelected,
        dbSessionId,
        sessionId,
        generateSessionId,
        transcribeUploadedAudio,
        updateSessionWithTranscription,
        onTranscriptionReady,
      ]
    );

    const isActive = isAudioRecording && !isAudioPaused;
    const isProcessing = isTranscribing || audioProcessingRef.current || isUploadTranscribing;

    return (
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          isActive ? "border-primary shadow-lg shadow-primary/10" : "hover:shadow-md"
        )}
      >
        {isActive && <div className="absolute inset-0 animate-pulse bg-primary/5" />}

        <div className="relative z-10 flex flex-col items-center gap-4 p-6">
          <div className="flex w-full items-center justify-between border-b pb-4">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "rounded-lg p-2 transition-colors",
                  isActive ? "animate-pulse bg-red-100 text-red-600" : "bg-primary/10 text-primary"
                )}
              >
                {isActive ? <Radio className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="text-lg font-semibold leading-none">Grabadora</h3>
                <p className="mt-1 text-xs text-muted-foreground">Captura de audio de consulta</p>
              </div>
            </div>

            {sessionId ? (
              <Badge
                variant="outline"
                className={cn(
                  "font-mono text-xs transition-colors",
                  isActive ? "border-red-200 bg-red-50 text-red-700" : "bg-background"
                )}
              >
                {isActive && (
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-ping rounded-full bg-red-500" />
                )}
                ID: {sessionId.substring(0, 8)}
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-muted text-xs text-muted-foreground">
                Esperando inicio
              </Badge>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6 grid w-full grid-cols-2 rounded-lg bg-muted/50 p-1.5">
              <TabsTrigger
                value="record"
                disabled={isProcessing || isAudioRecording}
                className="text-sm font-semibold transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
              >
                <Mic className="mr-2 h-4 w-4" />
                Grabar
              </TabsTrigger>
              <TabsTrigger
                value="upload"
                disabled={isProcessing || isAudioRecording}
                className="text-sm font-semibold transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
              >
                <Upload className="mr-2 h-4 w-4" />
                Subir Audio
              </TabsTrigger>
            </TabsList>

            <TabsContent value="record" className="mt-0">
              <div className="w-full py-2">
                <RecordingControls
                  isRecording={isAudioRecording}
                  isPaused={isAudioPaused}
                  isPatientSelected={isPatientSelected}
                  isTranscribing={isTranscribing || audioProcessingRef.current}
                  audioURL={audioURL}
                  audioWaveform={audioWaveform}
                  sessionId={sessionId}
                  recordingTime={recordingTime}
                  permissionDenied={permissionDenied}
                  onRequestPermission={requestPermission}
                  onGenerateSessionId={generateSessionId}
                  onStartRecording={handleStartRecording}
                  onPauseRecording={handlePauseRecording}
                  onResumeRecording={handleResumeRecording}
                  onStopRecording={handleStopRecording}
                />
              </div>
            </TabsContent>

            <TabsContent value="upload" className="mt-0">
              <div className="w-full py-2">
                <AudioFileUpload
                  onFileSelected={handleFileUpload}
                  isProcessing={isUploadTranscribing}
                  isDisabled={!isPatientSelected}
                />
                {!isPatientSelected && (
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    Selecciona un paciente para poder subir audio
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {isActive && (
            <div className="flex animate-pulse items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3 w-3 text-primary" />
              <span>Grabando audio de alta calidad...</span>
            </div>
          )}
        </div>
      </Card>
    );
  },
  (prevProps, nextProps) =>
    prevProps.patientId === nextProps.patientId &&
    prevProps.isPatientSelected === nextProps.isPatientSelected
);
