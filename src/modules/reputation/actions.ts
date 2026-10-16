'use server';

import { submitOwnRating, type SubmitRatingInput, type SubmitRatingResult } from './ratings';

/** Fronteira cliente: toda autorizacao, validacao e transacao ficam no dominio. */
export async function submitRating(input: SubmitRatingInput): Promise<SubmitRatingResult> {
  return submitOwnRating(input);
}
