#!/usr/bin/env tsx

import {
  analyzeDiffComplexity,
  analyzeUnifiedDiff,
  analyzeUnifiedDiffEnhanced,
  extractAddedLines,
  extractDeletedLines,
  getChangeContext,
  getFileChangeStats,
} from '../modules/services/diff-parse.js';

/**
 * Demo script showing the enhanced diff parsing capabilities using parse-diff
 */
async function demoParseIntegration() {
  console.log('🔍 Parse-Diff Integration Demo for Enhanced Git Diff Analysis\n');

  // Sample unified diff for demonstration
  const sampleDiff = `diff --git a/src/example.ts b/src/example.ts
index 1234567..abcdefg 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,10 +1,15 @@
 import { readFile } from 'fs/promises';
+import { z } from 'zod';
 
 export class FileProcessor {
   private files: string[] = [];
+  private schema = z.string();
 
   async processFile(path: string): Promise<string> {
+    // Validate input path
+    this.schema.parse(path);
+    
     const content = await readFile(path, 'utf8');
-    return content.toUpperCase();
+    return content.trim().toUpperCase();
   }
 
@@ -15,5 +20,8 @@ export class FileProcessor {
   }
 
   getFileCount(): number {
+    if (this.files.length === 0) {
+      throw new Error('No files processed');
+    }
     return this.files.length;
   }
 }
diff --git a/src/new-feature.ts b/src/new-feature.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/new-feature.ts
@@ -0,0 +1,12 @@
+/**
+ * New feature implementation
+ */
+export class NewFeature {
+  private enabled = false;
+
+  enable(): void {
+    this.enabled = true;
+  }
+
+  isEnabled(): boolean {
+    return this.enabled;
+  }
+}
diff --git a/src/removed-file.ts b/src/removed-file.ts
deleted file mode 100644
index abcdefg..0000000
--- a/src/removed-file.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export class RemovedClass {
-  deprecated(): void {
-    console.log('This is deprecated');
-  }
-}`;

  console.log('📋 Sample Diff Analysis\n');

  // Example 1: Legacy parsing (backward compatibility)
  console.log('🔄 Example 1: Legacy Parsing (Backward Compatible)');
  const legacyParsed = analyzeUnifiedDiff(sampleDiff);
  console.log('Legacy format summary:', {
    filesChanged: legacyParsed.summary.filesChanged,
    added: legacyParsed.summary.added,
    deleted: legacyParsed.summary.deleted,
  });

  legacyParsed.files.forEach((file) => {
    console.log(`  File: ${file.path} (${file.status})`);
    console.log(`    Hunks: ${file.hunks.length}`);
    file.hunks.forEach((hunk) => {
      console.log(
        `      Lines ${hunk.targetStart}-${hunk.targetEnd}: ${hunk.addedLines.length} additions`
      );
    });
  });

  // Example 2: Enhanced parsing with parse-diff
  console.log('\n🚀 Example 2: Enhanced Parsing with Parse-Diff');
  const enhancedParsed = analyzeUnifiedDiffEnhanced(sampleDiff);
  console.log('Enhanced format summary:', {
    filesChanged: enhancedParsed.summary.filesChanged,
    totalAdditions: enhancedParsed.summary.totalAdditions,
    totalDeletions: enhancedParsed.summary.totalDeletions,
  });

  enhancedParsed.files.forEach((file) => {
    console.log(`\n  File: ${file.path} (${file.status})`);
    console.log(`    Additions: ${file.additions}, Deletions: ${file.deletions}`);
    console.log(`    Chunks: ${file.chunks.length}`);

    // Show detailed chunk information
    file.chunks.forEach((chunk, index) => {
      console.log(`      Chunk ${index + 1}: ${chunk.changes.length} changes`);
      console.log(`        Old: ${chunk.oldStart}-${chunk.oldStart + chunk.oldLines - 1}`);
      console.log(`        New: ${chunk.newStart}-${chunk.newStart + chunk.newLines - 1}`);
    });
  });

  // Example 3: File change statistics
  console.log('\n📊 Example 3: Detailed File Statistics');
  enhancedParsed.files.forEach((file) => {
    const stats = getFileChangeStats(file.rawFile);
    console.log(`\n  ${file.path}:`);
    console.log(`    Total changes: ${stats.totalChanges}`);
    console.log(`    Additions: ${stats.additions}`);
    console.log(`    Deletions: ${stats.deletions}`);
    console.log(`    Context lines: ${stats.modifications}`);
    console.log(`    Change breakdown:`, stats.changesByType);
  });

  // Example 4: Extract specific line types
  console.log('\n➕ Example 4: Added Lines Analysis');
  enhancedParsed.files.forEach((file) => {
    const addedLines = extractAddedLines(file.rawFile);
    if (addedLines.length > 0) {
      console.log(`\n  ${file.path} - Added Lines:`);
      addedLines.forEach((line) => {
        console.log(`    Line ${line.lineNumber}: ${line.content.trim()}`);
      });
    }
  });

  console.log('\n➖ Example 5: Deleted Lines Analysis');
  enhancedParsed.files.forEach((file) => {
    const deletedLines = extractDeletedLines(file.rawFile);
    if (deletedLines.length > 0) {
      console.log(`\n  ${file.path} - Deleted Lines:`);
      deletedLines.forEach((line) => {
        console.log(`    Line ${line.lineNumber}: ${line.content.trim()}`);
      });
    }
  });

  // Example 6: Context analysis
  console.log('\n🔍 Example 6: Change Context Analysis');
  enhancedParsed.files.forEach((file) => {
    const contextualChanges = getChangeContext(file.rawFile, 2);
    if (contextualChanges.length > 0) {
      console.log(`\n  ${file.path} - Contextualized Changes:`);
      contextualChanges.slice(0, 3).forEach((ctx, index) => {
        console.log(`    Change ${index + 1} (${ctx.change.type}):`);
        console.log(`      Content: ${ctx.change.content.trim()}`);
        if (ctx.beforeContext.length > 0) {
          console.log(`      Before: ${ctx.beforeContext.map((c) => c.content.trim()).join(', ')}`);
        }
        if (ctx.afterContext.length > 0) {
          console.log(`      After: ${ctx.afterContext.map((c) => c.content.trim()).join(', ')}`);
        }
      });
    }
  });

  // Example 7: Diff complexity analysis
  console.log('\n📈 Example 7: Diff Complexity Analysis');
  const complexity = analyzeDiffComplexity(enhancedParsed);
  console.log(`Complexity: ${complexity.complexity}`);
  console.log('Insights:');
  for (const insight of complexity.insights) {
    console.log(`  - ${insight}`);
  }
  console.log('Recommendations:');
  for (const rec of complexity.recommendations) {
    console.log(`  - ${rec}`);
  }
  console.log('Metrics:', {
    filesChanged: complexity.metrics.filesChanged,
    totalLines: complexity.metrics.totalLines,
    additionRatio: (complexity.metrics.additionRatio * 100).toFixed(1) + '%',
    deletionRatio: (complexity.metrics.deletionRatio * 100).toFixed(1) + '%',
    averageChunksPerFile: complexity.metrics.averageChunksPerFile.toFixed(1),
    largestFile: complexity.metrics.largestFile,
  });

  console.log('\n🎯 Benefits of Parse-Diff Integration:');
  console.log('✅ Robust parsing that handles edge cases');
  console.log('✅ Rich metadata about file changes');
  console.log('✅ Detailed change analysis capabilities');
  console.log('✅ Better file status detection (A/M/D/R)');
  console.log('✅ Line-by-line change tracking');
  console.log('✅ Context-aware analysis');
  console.log('✅ Complexity assessment');
  console.log('✅ Backward compatibility maintained');

  console.log('\n💡 Use Cases:');
  console.log('1. Enhanced code review insights');
  console.log('2. Diff complexity assessment');
  console.log('3. Change impact analysis');
  console.log('4. Automated review prioritization');
  console.log('5. Code quality metrics');
  console.log('6. Review workload estimation');

  console.log('\n🚀 Ready for elegant diff parsing with parse-diff!');
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demoParseIntegration().catch(console.error);
}
