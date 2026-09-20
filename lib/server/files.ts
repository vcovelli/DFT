import "server-only";
import { randomUUID } from "node:crypto";
import { validatePdf } from "../domain";
import { transaction } from "./db";
import { getOrder, checkUploadAccess, activity, digest } from "./orders";
import { assert, HttpError } from "./http";
import { storage } from "./providers";
export async function uploadTemplate(
  id: string,
  token: string | null,
  name: string,
  type: string,
  bytes: Buffer,
) {
  try {
    validatePdf(name, type, bytes);
  } catch {
    throw new HttpError(400, "Use one valid PDF file up to 3 MB.");
  }
  return transaction(async (tx) => {
    const order = await getOrder(id, tx, true);
    checkUploadAccess(order, token);
    // Repeated identical upload is harmless. No replacing a previously attached template.
    if (order.template_key) {
      assert(
        order.template_sha256 === digest(bytes),
        "An order can have only one template. Contact DFT to change it.",
      );
      return;
    }
    const key = `${order.id}/${randomUUID()}.pdf`;
    const { error } = await storage()
      .storage.from("templates")
      .upload(key, bytes, { contentType: "application/pdf", upsert: false });
    if (error) throw new Error("Storage upload failed");
    await tx.query(
      "UPDATE orders SET template_key=$2,template_name=$3,template_size=$4,template_sha256=$5 WHERE id=$1",
      [id, key, name, bytes.length, digest(bytes)],
    );
    await activity(tx, id, "customer", "template_uploaded");
    // Objects from an interrupted DB commit are removed by scheduled orphan cleanup.
  });
}
