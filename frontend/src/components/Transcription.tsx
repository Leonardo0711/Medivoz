import { useEffect, useRef } from "react";
import { FileText, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TranscriptionProps {
  transcription: string;
}

export function Transcription({ transcription }: TranscriptionProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [transcription]);

  return (
    <div className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-md border bg-background">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Texto recibido en vivo</span>
        </div>
        <Badge variant="outline" className="bg-background text-xs">
          {transcription.length} caracteres
        </Badge>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {transcription ? (
          <div className="space-y-3 whitespace-pre-wrap px-5 py-4 text-sm leading-6 text-foreground">
            {transcription}
            <div ref={endRef} />
          </div>
        ) : (
          <div className="flex min-h-[320px] items-center justify-center p-8 text-center">
            <div>
              <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <h3 className="font-medium text-foreground">Esperando voz</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Al iniciar la grabacion, los fragmentos confirmados apareceran aqui durante la consulta.
              </p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
