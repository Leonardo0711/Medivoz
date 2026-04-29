#!/bin/bash
# Script to replace all console.log/error/warn with logger
# This is a helper script - manual review recommended

# Find all files with console statements
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec grep -l "console\.\(log\|error\|warn\|info\|debug\)" {} \; | while read file; do
  echo "Processing: $file"
  
  # Add import if not present (simple check)
  if ! grep -q "from '@/utils/logger'" "$file" && grep -q "console\." "$file"; then
    # Find the last import line and add logger import after it
    # This is a simplified approach - manual review recommended
    echo "  -> Needs logger import"
  fi
done

echo "Done! Please review and manually add logger imports where needed."
