import { useState } from "react";
import SectionBody from "@/components/SectionBody";
import SectionHeader from "@/components/SectionHeader";
import { useTranslation } from "@/hooks/useTranslation";
import { useContactsAddresses } from "@/queries/useContactsAddresses";
import SectionItem from "@/components/SectionItem";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import Avatar from "@/components/Avatar";
import { formatPhoneNumber } from "@/utils/FormatUtils";
import SearchBar from "@/components/SearchBar";
import Fuse from "fuse.js";
import { contactName } from "@/supabase/client";
import { addressId } from "./$addressId";

export const Route = createFileRoute("/_auth/contacts/")({
  component: ListContacts,
});

function ListContacts() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { data: rows } = useContactsAddresses();
  const [search, setSearch] = useState("");

  // An entry is one connection's address-book row; its name lives in extra
  // (saved name over push name, see contactName).
  const contacts = (rows ?? [])
    .map((row) => ({ row, name: contactName(row.extra) }))
    .sort((a, b) =>
      (a.name || a.row.address).localeCompare(b.name || b.row.address),
    );

  let filtered = contacts;
  if (search) {
    const fuse = new Fuse(contacts, {
      threshold: 0.4,
      keys: ["name", "row.address"],
    });
    filtered = fuse.search(search).map((r) => r.item);
  }

  return (
    <>
      <SectionHeader title={t("Contactos")} />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder={t("Buscar contactos")}
      />

      <SectionBody>
        <SectionItem
          title={t("Agregar contacto")}
          aside={
            <div className="p-[8px] bg-primary/10 rounded-full">
              <Plus className="w-[24px] h-[24px] text-primary" />
            </div>
          }
          onClick={() =>
            navigate({
              to: "/contacts/new",
              hash: (prevHash) => prevHash!,
            })
          }
        />
        {search && filtered.length === 0 && (
          <div className="py-[32px] text-center text-muted-foreground text-[14px]">
            {t("Sin resultados para")} "{search}"
          </div>
        )}
        {filtered.map(({ row, name }) => (
          <SectionItem
            key={addressId(row)}
            title={name || t("Sin nombre")}
            description={
              row.service === "whatsapp" || row.service === "whatsapp-web"
                ? formatPhoneNumber(row.address)
                : row.address
            }
            aside={
              <Avatar
                fallback={name?.substring(0, 2).toUpperCase() || "?"}
                size={40}
                className="bg-muted text-muted-foreground"
              />
            }
            onClick={() =>
              navigate({
                to: "/contacts/$addressId",
                params: { addressId: addressId(row) },
                hash: (prevHash) => prevHash!,
              })
            }
          />
        ))}
      </SectionBody>
    </>
  );
}
