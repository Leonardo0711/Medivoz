
import React from "react";
import { Button } from "@/components/ui/button";
import { BookOpen, FileText, Upload } from "lucide-react";

interface AgentDocumentsProps {
  documents: string[] | undefined;
}

export function AgentDocuments({ documents }: AgentDocumentsProps) {
  return (
    <div className="space-y-4">
      {documents && documents.length > 0 ? (
        <ul className="space-y-2 border rounded-md p-3 bg-muted/30">
          {documents.map((doc, index) => (
            <li key={index} className="flex items-center py-1 px-2 hover:bg-muted rounded-sm transition-colors">
              <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-sm">{doc}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-6 border border-dashed rounded-md">
          <BookOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No hay documentos asociados</p>
        </div>
      )}
      <Button variant="outline" size="sm" className="w-full">
        <Upload className="h-4 w-4 mr-2" />
        Subir Documento
      </Button>
    </div>
  );
}
