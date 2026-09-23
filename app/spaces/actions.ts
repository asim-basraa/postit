"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSpace, renameSpace, setSkillset } from "@/lib/spaces";

export type SpaceFormState = { error?: string };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function createSpaceAction(
  _prev: SpaceFormState,
  formData: FormData,
): Promise<SpaceFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();

  if (!name) return { error: "Give the space a name." };
  if (!SLUG_PATTERN.test(slug)) {
    return {
      error:
        "The address may use lowercase letters, numbers and hyphens only.",
    };
  }

  const result = await createSpace(slug, name);
  if (result.error) return { error: result.error };

  revalidatePath("/spaces");
  redirect(`/s/${result.slug}`);
}

/**
 * Renames a space.
 *
 * Both places the space is named have to be told: the list at /spaces and the
 * space's own pages, which carry its name in the header and on its front page.
 * Missing either is what makes a rename look like it did not take.
 */
export async function renameSpaceAction(
  spaceId: string,
  name: string,
): Promise<SpaceFormState> {
  const result = await renameSpace(spaceId, name);
  if (result.error) return { error: result.error };

  revalidatePath("/spaces");
  revalidatePath("/s", "layout");
  return {};
}

/**
 * Turns a space into a skillset, or back into an ordinary space.
 *
 * The same two paths a rename revalidates, for the same reason: the mark shows
 * in the list of spaces and in the space's own header, and refreshing one
 * without the other is what makes a setting look like it did not take.
 */
export async function setSkillsetAction(
  spaceId: string,
  isSkillset: boolean,
): Promise<SpaceFormState> {
  const result = await setSkillset(spaceId, isSkillset);
  if (result.error) return { error: result.error };

  revalidatePath("/spaces");
  revalidatePath("/s", "layout");
  return {};
}
