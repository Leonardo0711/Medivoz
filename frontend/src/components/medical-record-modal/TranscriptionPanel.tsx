
import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoaderCircle, Sparkles } from "lucide-react";
import { TranscriptionSnippet } from "../medical-record/TranscriptionSnippet";

interface TranscriptionPanelProps {
  transcriptionSnippet: string;
  fullTranscription: string;
  showFullTranscription: boolean;
  onToggleTranscription: () => void;
  onAutoFill: () => void;
  isAutoFilling: boolean;
}

export const TranscriptionPanel = memo(function TranscriptionPanel({
  transcriptionSnippet,
  fullTranscription,
  showFullTranscription,
  onToggleTranscription,
  onAutoFill,
  isAutoFilling
}: TranscriptionPanelProps) {
  const characterCount = useMemo(() => {
    return (fullTranscription?.length || 0).toLocaleString();
  }, [fullTranscription?.length]);

  return (
    <>
      <div className="flex items-center justify-between mb-2 mt-4">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          Transcripción de la consulta
          <Badge variant="outline" className="text-xs ml-2 bg-muted/50">
            {characterCount} caracteres
          </Badge>
        </h3>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onAutoFill}
          disabled={isAutoFilling || !fullTranscription}
          className="flex items-center gap-1 text-xs h-7 text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent hover:border-border/50"
          title="Usar como respaldo si el auto-rellenado automático no funcionó"
        >
          {isAutoFilling ? (
            <>
              <LoaderCircle className="h-3.5 w-3.5 animate-spin mr-1" />
              Procesando...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Re-llenar manualmente
            </>
          )}
        </Button>
      </div>

      <TranscriptionSnippet 
        transcriptionSnippet={transcriptionSnippet}
        fullTranscription={fullTranscription}
        showFullTranscription={showFullTranscription}
        onToggleTranscription={onToggleTranscription}
      />
    </>
  );
});
