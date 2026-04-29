
import { FilePen, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TranscriptionSnippetProps {
  transcriptionSnippet: string;
  fullTranscription?: string;
  showFullTranscription?: boolean;
  onToggleTranscription?: () => void;
}

export function TranscriptionSnippet({ 
  transcriptionSnippet, 
  fullTranscription, 
  showFullTranscription = false,
  onToggleTranscription 
}: TranscriptionSnippetProps) {
  if (!transcriptionSnippet) return null;
  
  return (
    <div className="bg-muted rounded-md mb-4 overflow-hidden border border-muted-foreground/10">
      <div className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FilePen className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-medium">Transcripción de la consulta:</h4>
          </div>
          
          {fullTranscription && onToggleTranscription && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onToggleTranscription}
              className="h-6 px-2 hover:bg-muted-foreground/10"
            >
              {showFullTranscription ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  <span className="text-xs">Colapsar</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  <span className="text-xs">Expandir</span>
                </>
              )}
            </Button>
          )}
        </div>
        
        {showFullTranscription && fullTranscription ? (
          <div className="text-sm text-muted-foreground whitespace-pre-line max-h-[400px] overflow-y-auto p-2 bg-background/50 rounded">
            {fullTranscription}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground p-2 bg-background/50 rounded">{transcriptionSnippet}</p>
        )}
      </div>
    </div>
  );
}
