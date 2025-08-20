import simpleGit, { type SimpleGit } from 'simple-git';

export const cloneAndPrepare = async (args: {
  repoUrl: string;
  workdir: string;
}): Promise<SimpleGit> => {
  const git = simpleGit();
  await git.clone(args.repoUrl, args.workdir, ['--no-tags', '--depth', '50']);
  return simpleGit(args.workdir);
};

export const getUnifiedDiff = async (
  git: SimpleGit,
  sourceRef: string,
  targetRef: string
): Promise<string> => {
  await git.fetch(['--all']);
  const diff = await git.raw(['diff', `${sourceRef}..${targetRef}`, '--unified=3']);
  return diff;
};

export const getCommitMessages = async (git: SimpleGit, sourceRef: string, targetRef: string) => {
  const logs = await git.raw([
    'log',
    '--pretty=%H%x09%an%x09%ae%x09%ad%x09%s',
    `${sourceRef}..${targetRef}`,
  ]);
  return logs
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, author, email, date, ...rest] = l.split('\t');
      return { hash, author, email, date, subject: rest.join('\t') };
    });
};
