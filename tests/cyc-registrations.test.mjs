import assert from "node:assert/strict";
import test from "node:test";

const { providerFromRegistration, registrationsCollectionId, seniorCareFilter } =
  await import("../src/lib/support/cyc-registrations.ts");

const registration = {
  id: "wix-item-1",
  data: {
    role: "New Student",
    firstName: "Amy",
    lastName: "Chan",
    email: "amy@example.com",
    phone: "416-555-0110",
    school: "Northview SS",
    postalCode: "m2n 5x9",
    grade: "11",
    projectOption: "Senior Care",
  },
};

test("a Senior Care registration becomes an unverified support worker", () => {
  assert.deepEqual(providerFromRegistration(registration), {
    external_id: "wix-item-1",
    source: "cyc_registration",
    display_name: "Amy Chan",
    provider_type: "high_school",
    email: "amy@example.com",
    phone: "416-555-0110",
    school: "Northview SS",
    grade: "11",
    locations: ["M2N", "M2N5X9"],
    languages: ["English"],
    service_modes: ["either"],
  });
});

test("registrants outside grades 9-12 land in the college tier", () => {
  const older = { ...registration, data: { ...registration.data, grade: "" } };
  assert.equal(providerFromRegistration(older).provider_type, "college");
});

test("a postal code shorter than a full code keeps just the sortation area", () => {
  const partial = { ...registration, data: { ...registration.data, postalCode: "M2N" } };
  assert.deepEqual(providerFromRegistration(partial).locations, ["M2N"]);
  const missing = { ...registration, data: { ...registration.data, postalCode: "" } };
  assert.deepEqual(providerFromRegistration(missing).locations, []);
});

test("the email stands in when a registrant left their name blank", () => {
  const nameless = {
    ...registration,
    data: { ...registration.data, firstName: "", lastName: "" },
  };
  assert.equal(providerFromRegistration(nameless).display_name, "amy@example.com");
});

test("rows with no id or no way to reach anyone are skipped", () => {
  assert.equal(providerFromRegistration({ data: registration.data }), null);
  assert.equal(
    providerFromRegistration({ id: "wix-item-2", data: { grade: "10" } }),
    null,
  );
});

test("flat rows without a data envelope are read directly", () => {
  assert.equal(
    providerFromRegistration({ _id: "wix-item-3", firstName: "Bo", lastName: "Li" })
      .external_id,
    "wix-item-3",
  );
});

test("the sync targets the Registrations collection and the Senior Care option", () => {
  delete process.env.WIX_REGISTRATIONS_COLLECTION_ID;
  assert.equal(registrationsCollectionId(), "Registrations");
  process.env.WIX_REGISTRATIONS_COLLECTION_ID = "CycRegistrations";
  assert.equal(registrationsCollectionId(), "CycRegistrations");
  assert.deepEqual(seniorCareFilter(), { projectOption: "Senior Care" });
});
