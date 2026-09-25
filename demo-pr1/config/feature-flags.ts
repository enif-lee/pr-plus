export const FLAGS = {
  treeView: true,
  fastReview: true,
  reverseComments: true,
  singleFileMode: false,
  autoOpenEmbed: true,
} as const;

export type FlagName = keyof typeof FLAGS;
