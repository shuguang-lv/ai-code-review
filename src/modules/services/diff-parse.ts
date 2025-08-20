import parseDiff from 'parse-diff';
import type {
  DiffChange,
  DiffChunk,
  DiffFile,
  EnhancedParsedDiff,
  ParsedDiff,
  ParsedHunk,
} from '../types.js';

/**
 * Enhanced unified diff analyzer using parse-diff library
 *
 * @param diffText - The unified diff text to parse
 * @returns Enhanced parsed diff with detailed information
 */
export const analyzeUnifiedDiffEnhanced = (diffText: string): EnhancedParsedDiff => {
  // Use parse-diff for robust parsing
  const parsedFiles = parseDiff(diffText);

  const files = parsedFiles.map((file) => {
    // Determine file path - parse-diff handles both 'from' and 'to'
    const path = getFilePath(file);

    // Determine file status based on parse-diff flags
    const status = getFileStatus(file);

    return {
      path,
      status,
      rawFile: file,
      chunks: file.chunks,
      additions: file.additions,
      deletions: file.deletions,
    };
  });

  // Calculate comprehensive summary statistics
  const summary = {
    added: files.reduce((sum, file) => sum + file.additions, 0),
    deleted: files.reduce((sum, file) => sum + file.deletions, 0),
    filesChanged: files.length,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };

  return {
    files,
    summary,
  };
};

/**
 * Legacy diff analyzer for backward compatibility
 * Converts enhanced parse-diff output to legacy format
 *
 * @param diffText - The unified diff text to parse
 * @returns Parsed diff in legacy format
 */
export const analyzeUnifiedDiff = (diffText: string): ParsedDiff => {
  const enhanced = analyzeUnifiedDiffEnhanced(diffText);

  // Convert enhanced format to legacy format
  const files = enhanced.files.map((file) => ({
    path: file.path,
    status: file.status,
    hunks: convertChunksToLegacyHunks(file.chunks, file.path),
  }));

  return {
    files,
    summary: {
      added: enhanced.summary.added,
      deleted: enhanced.summary.deleted,
      filesChanged: enhanced.summary.filesChanged,
    },
  };
};

/**
 * Get file path from parse-diff file object
 */
function getFilePath(file: DiffFile): string {
  // Handle different scenarios
  if (file.to && file.to !== '/dev/null') {
    return file.to.replace(/^b\//, ''); // Remove 'b/' prefix if present
  }

  if (file.from && file.from !== '/dev/null') {
    return file.from.replace(/^a\//, ''); // Remove 'a/' prefix if present
  }

  return 'unknown';
}

/**
 * Determine file status from parse-diff file object
 */
function getFileStatus(file: DiffFile): 'A' | 'M' | 'D' | 'R' {
  if (file.new) {
    return 'A'; // Added
  }

  if (file.deleted) {
    return 'D'; // Deleted
  }

  // Check if it's a rename (different from/to paths)
  if (file.from && file.to && file.from !== file.to) {
    return 'R'; // Renamed
  }

  return 'M'; // Modified (default)
}

/**
 * Convert parse-diff chunks to legacy hunk format
 */
function convertChunksToLegacyHunks(chunks: DiffChunk[], filePath: string): ParsedHunk[] {
  return chunks.map((chunk) => {
    const addedLines: Array<{ lineNumber: number; content: string }> = [];

    // Extract added lines from changes
    for (const change of chunk.changes) {
      if (change.type === 'add') {
        addedLines.push({
          lineNumber: change.ln,
          content: change.content,
        });
      }
    }

    // Calculate target range
    const targetStart = chunk.newStart;
    const targetEnd = chunk.newStart + chunk.newLines - 1;

    return {
      filePath,
      targetStart,
      targetEnd,
      addedLines,
    };
  });
}

/**
 * Get detailed change statistics for a file
 */
export function getFileChangeStats(file: DiffFile): {
  additions: number;
  deletions: number;
  modifications: number;
  totalChanges: number;
  changesByType: Record<'add' | 'del' | 'normal', number>;
} {
  const changesByType = { add: 0, del: 0, normal: 0 };

  for (const chunk of file.chunks) {
    for (const change of chunk.changes) {
      changesByType[change.type]++;
    }
  }

  return {
    additions: file.additions,
    deletions: file.deletions,
    modifications: changesByType.normal,
    totalChanges: changesByType.add + changesByType.del + changesByType.normal,
    changesByType,
  };
}

/**
 * Extract specific lines from diff for analysis
 */
export function extractAddedLines(file: DiffFile): Array<{
  lineNumber: number;
  content: string;
  chunkIndex: number;
}> {
  const addedLines: Array<{
    lineNumber: number;
    content: string;
    chunkIndex: number;
  }> = [];

  file.chunks.forEach((chunk, chunkIndex) => {
    chunk.changes.forEach((change) => {
      if (change.type === 'add') {
        addedLines.push({
          lineNumber: change.ln,
          content: change.content,
          chunkIndex,
        });
      }
    });
  });

  return addedLines;
}

/**
 * Extract deleted lines from diff
 */
export function extractDeletedLines(file: DiffFile): Array<{
  lineNumber: number;
  content: string;
  chunkIndex: number;
}> {
  const deletedLines: Array<{
    lineNumber: number;
    content: string;
    chunkIndex: number;
  }> = [];

  file.chunks.forEach((chunk, chunkIndex) => {
    chunk.changes.forEach((change) => {
      if (change.type === 'del') {
        deletedLines.push({
          lineNumber: change.ln,
          content: change.content,
          chunkIndex,
        });
      }
    });
  });

  return deletedLines;
}

/**
 * Get context lines around changes for better analysis
 */
export function getChangeContext(
  file: DiffFile,
  contextLines: number = 3
): Array<{
  change: DiffChange;
  beforeContext: DiffChange[];
  afterContext: DiffChange[];
  chunkIndex: number;
}> {
  const contextualized: Array<{
    change: DiffChange;
    beforeContext: DiffChange[];
    afterContext: DiffChange[];
    chunkIndex: number;
  }> = [];

  file.chunks.forEach((chunk, chunkIndex) => {
    chunk.changes.forEach((change, changeIndex) => {
      // Only analyze actual changes, not context lines
      if (change.type === 'add' || change.type === 'del') {
        const beforeContext = chunk.changes
          .slice(Math.max(0, changeIndex - contextLines), changeIndex)
          .filter((c) => c.type === 'normal');

        const afterContext = chunk.changes
          .slice(changeIndex + 1, changeIndex + 1 + contextLines)
          .filter((c) => c.type === 'normal');

        contextualized.push({
          change,
          beforeContext,
          afterContext,
          chunkIndex,
        });
      }
    });
  });

  return contextualized;
}

/**
 * Analyze diff complexity and provide insights
 */
export function analyzeDiffComplexity(enhanced: EnhancedParsedDiff): {
  complexity: 'low' | 'medium' | 'high' | 'very-high';
  insights: string[];
  recommendations: string[];
  metrics: {
    filesChanged: number;
    totalLines: number;
    additionRatio: number;
    deletionRatio: number;
    averageChunksPerFile: number;
    largestFile: { path: string; changes: number } | null;
  };
} {
  const insights: string[] = [];
  const recommendations: string[] = [];

  const totalLines = enhanced.summary.totalAdditions + enhanced.summary.totalDeletions;
  const additionRatio = enhanced.summary.totalAdditions / totalLines;
  const deletionRatio = enhanced.summary.totalDeletions / totalLines;
  const averageChunksPerFile =
    enhanced.files.reduce((sum, file) => sum + file.chunks.length, 0) / enhanced.files.length;

  const largestFile = enhanced.files.reduce(
    (largest, file) => {
      const changes = file.additions + file.deletions;
      return !largest || changes > largest.changes ? { path: file.path, changes } : largest;
    },
    null as { path: string; changes: number } | null
  );

  // Determine complexity
  let complexity: 'low' | 'medium' | 'high' | 'very-high' = 'low';

  if (enhanced.summary.filesChanged > 20 || totalLines > 1000) {
    complexity = 'very-high';
    insights.push('Very large diff with significant changes across many files');
    recommendations.push('Consider breaking this into smaller, focused changes');
  } else if (enhanced.summary.filesChanged > 10 || totalLines > 500) {
    complexity = 'high';
    insights.push('Large diff that may benefit from careful review');
    recommendations.push('Review each file individually and ensure changes are related');
  } else if (enhanced.summary.filesChanged > 5 || totalLines > 200) {
    complexity = 'medium';
    insights.push('Moderate-sized diff with multiple changes');
    recommendations.push('Group related changes and review systematically');
  } else {
    insights.push('Small, focused diff that should be easy to review');
    recommendations.push('Quick review focusing on logic and edge cases');
  }

  // Additional insights based on ratios
  if (additionRatio > 0.8) {
    insights.push('Primarily new code being added');
  } else if (deletionRatio > 0.8) {
    insights.push('Primarily code being removed');
  } else {
    insights.push('Balanced mix of additions and deletions');
  }

  if (averageChunksPerFile > 5) {
    insights.push('Files have many scattered changes');
    recommendations.push('Consider if changes could be more focused');
  }

  return {
    complexity,
    insights,
    recommendations,
    metrics: {
      filesChanged: enhanced.summary.filesChanged,
      totalLines,
      additionRatio,
      deletionRatio,
      averageChunksPerFile,
      largestFile,
    },
  };
}
