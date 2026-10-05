import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { orpc, client } from "../lib/api";
import { useInvalidating } from "../lib/use-invalidating";

export type CampaignDetailInput = Parameters<typeof client.campaigns.detail>[0];
const keys = () => [orpc.campaigns.key()];

export const useCampaigns = () => useQuery(orpc.campaigns.list.queryOptions({ retry: false }));
export const useCampaign = (input: CampaignDetailInput) => useQuery(orpc.campaigns.detail.queryOptions({ input, enabled: Boolean(input.id), placeholderData: keepPreviousData, retry: false }));
export const useCampaignLinkQr = () => useInvalidating(orpc.campaigns.linkQr.mutationOptions(), []);

export const useCreateCampaign = () => useInvalidating(orpc.campaigns.create.mutationOptions(), keys());
export const useUpdateCampaign = () => useInvalidating(orpc.campaigns.update.mutationOptions(), keys());
export const useSetGoal = () => useInvalidating(orpc.campaigns.setGoal.mutationOptions(), keys());
export const useAddLink = () => useInvalidating(orpc.campaigns.addLink.mutationOptions(), keys());
export const useAddTask = () => useInvalidating(orpc.campaigns.addTask.mutationOptions(), keys());
export const useSetTaskStatus = () => useInvalidating(orpc.campaigns.setTaskStatus.mutationOptions(), keys());
export const useSetBudgetLine = () => useInvalidating(orpc.campaigns.setBudgetLine.mutationOptions(), keys());
