
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

interface TranscriptionProps {
  transcription: string;
}

export function Transcription({ transcription }: TranscriptionProps) {
  if (!transcription) {
    return (
      <Card className="h-full flex items-center justify-center bg-muted/30">
        <div className="text-center p-6 md:p-12">
          <FileText className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground">Sin transcripción</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Inicia una grabación para generar la transcripción de la consulta médica.
          </p>
        </div>
      </Card>
    );
  }

  return (
      <Card className="h-full flex flex-col shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b border-border">
          <CardTitle className="text-lg md:text-xl text-foreground">Transcripción</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto flex-grow p-4">
          <div className="space-y-4 whitespace-pre-line text-sm md:text-base text-card-foreground">
            {transcription}
          </div>
        </CardContent>
      </Card>
  );
}
