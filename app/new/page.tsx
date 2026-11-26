import ProposalWizard from "./ProposalWizard";

export default async function NewProposalPage({ searchParams }: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { type } = await searchParams;
  const treasury = type === "treasury";
  return <ProposalWizard key={treasury ? "treasury" : "general"} startWithTreasury={treasury} />;
}
