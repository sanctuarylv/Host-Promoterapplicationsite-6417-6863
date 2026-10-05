import { useMutation } from "@tanstack/react-query";
import { orpc } from "../lib/api";

/** Public application submission (crew.submit). */
export function useSubmitApplication() {
  return useMutation(orpc.crew.submit.mutationOptions({ retry: false }));
}

/** Separate nonprofit Serve Team interest (crew.serveInterest). */
export function useSubmitServeInterest() {
  return useMutation(orpc.crew.serveInterest.mutationOptions({ retry: false }));
}
