import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileAudio, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AudioFileUploadProps {
  onFileSelected: (file: File) => void;
  isProcessing: boolean;
  isDisabled: boolean;
}

const ACCEPTED_AUDIO_FORMATS = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
];

const ACCEPTED_EXTENSIONS = ".mp3,.wav,.webm,.ogg,.m4a,.mp4,.aac,.flac";

export function AudioFileUpload({ 
  onFileSelected, 
  isProcessing,
  isDisabled 
}: AudioFileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file: File) => {
    // Check file type
    const isValidType = ACCEPTED_AUDIO_FORMATS.some(format => 
      file.type === format || file.type.startsWith("audio/")
    );
    
    if (!isValidType) {
      toast.error("Formato de archivo no soportado. Use MP3, WAV, M4A, OGG, etc.");
      return;
    }

    // Check file size (max 25MB for Whisper API)
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("El archivo es demasiado grande. Máximo 25MB.");
      return;
    }

    setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleUploadClick = () => {
    if (selectedFile) {
      onFileSelected(selectedFile);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileChange}
        className="hidden"
        disabled={isDisabled || isProcessing}
      />

      {!selectedFile ? (
        <div
          onClick={() => !isDisabled && fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300",
            isDragging 
              ? "border-primary bg-gradient-to-br from-primary/10 to-secondary/10 shadow-lg shadow-primary/20 scale-[1.02]" 
              : "border-border hover:border-primary/60 hover:bg-gradient-to-br hover:from-primary/5 hover:to-secondary/5 hover:shadow-md hover:scale-[1.01]",
            isDisabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {!isDragging && (
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 opacity-0 hover:opacity-100 transition-opacity duration-300" />
          )}
          <div className="flex flex-col items-center gap-4 py-2 relative z-10">
            <div className={cn(
              "p-4 rounded-full transition-all duration-300",
              isDragging 
                ? "bg-gradient-to-br from-primary/20 to-secondary/20 shadow-lg shadow-primary/20 scale-110" 
                : "bg-gradient-to-br from-primary/10 to-secondary/10 hover:from-primary/15 hover:to-secondary/15 hover:scale-105"
            )}>
              <Upload className={cn(
                "h-7 w-7 transition-colors duration-300",
                isDragging ? "text-primary" : "text-primary"
              )} />
            </div>
            <div>
              <p className={cn(
                "text-base font-semibold transition-colors duration-300",
                isDragging ? "text-primary" : "text-foreground"
              )}>
                {isDragging ? "Suelta el archivo aquí" : "Subir archivo de audio"}
              </p>
              <p className="text-sm text-muted-foreground mt-1.5">
                MP3, WAV, M4A, OGG, FLAC (máx. 25MB)
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-3 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileAudio className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            {!isProcessing && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleClearFile}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <Button
            onClick={handleUploadClick}
            disabled={isProcessing || isDisabled}
            className="relative w-full mt-3 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-primary-foreground font-semibold text-base px-6 py-6 h-auto shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            size="lg"
          >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 opacity-0 hover:opacity-100 transition-opacity duration-300 disabled:opacity-0" />
            {isProcessing ? (
              <>
                <Loader2 className="h-5 w-5 mr-3 animate-spin relative z-10" />
                <span className="relative z-10">Transcribiendo...</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 mr-3 relative z-10" />
                <span className="relative z-10">Transcribir Audio</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
