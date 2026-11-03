import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, detailOf, unwrap, type Schemas } from "@/api/client";
import { i18n } from "@/i18n";
import { invalidateClassification } from "@/features/rules/queries";

/** Anche le archiviate: servono solo alla gestione delle categorie. */
export function useAllCategories() {
  return useQuery({
    queryKey: ["categories", "all"],
    queryFn: () =>
      unwrap(api.GET("/api/categories", { params: { query: { include_archived: true } } })),
  });
}

function useCategoryMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // La mutazione resta "in corso" finché l'elenco non è aggiornato: chi mostra il nome
    // appena scritto (dalle `variables`) non vede ricomparire per un attimo quello vecchio.
    onSuccess: () => {
      invalidateClassification(client);
      return client.refetchQueries(
        { queryKey: ["categories", "all"], type: "active" },
        { cancelRefetch: false },
      );
    },
  });
}

export function useCreateCategory() {
  return useCategoryMutation((name: string) =>
    unwrap(api.POST("/api/categories", { body: { name, kind: "expense" } })),
  );
}

export function useUpdateCategory() {
  return useCategoryMutation(({ id, body }: { id: number; body: Schemas["CategoryUpdate"] }) =>
    unwrap(
      api.PATCH("/api/categories/{category_id}", { params: { path: { category_id: id } }, body }),
    ),
  );
}

export function useDeleteCategory() {
  return useCategoryMutation(async (id: number) => {
    const { response, error } = await api.DELETE("/api/categories/{category_id}", {
      params: { path: { category_id: id } },
    });
    if (!response.ok) {
      throw new Error(detailOf(error) ?? i18n.t("errors.deleteFailed"));
    }
  });
}

export function useMergeCategory() {
  return useCategoryMutation(({ id, intoId }: { id: number; intoId: number }) =>
    unwrap(
      api.POST("/api/categories/{category_id}/merge", {
        params: { path: { category_id: id } },
        body: { into_id: intoId },
      }),
    ),
  );
}

export function useCreateSubcategory() {
  return useCategoryMutation(({ categoryId, name }: { categoryId: number; name: string }) =>
    unwrap(
      api.POST("/api/categories/{category_id}/subcategories", {
        params: { path: { category_id: categoryId } },
        body: { name },
      }),
    ),
  );
}

export function useUpdateSubcategory() {
  return useCategoryMutation(({ id, body }: { id: number; body: Schemas["SubcategoryUpdate"] }) =>
    unwrap(
      api.PATCH("/api/subcategories/{subcategory_id}", {
        params: { path: { subcategory_id: id } },
        body,
      }),
    ),
  );
}

/** Cosa usa una sottocategoria (movimenti, regole, budget...), per decidere come eliminarla. */
export function useSubcategoryUsage(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["categories", "usage", id],
    queryFn: () =>
      unwrap(
        api.GET("/api/subcategories/{subcategory_id}/usage", {
          params: { path: { subcategory_id: id } },
        }),
      ),
    enabled,
  });
}

/**
 * Elimina una sottocategoria. Se è in uso, `intoId` dice dove spostare movimenti, regole e
 * budget: un'altra sottocategoria della stessa categoria o `null` (solo la categoria).
 */
export function useDeleteSubcategory() {
  return useCategoryMutation(
    async ({ id, inUse, intoId }: { id: number; inUse: boolean; intoId: number | null }) => {
      if (inUse) {
        await unwrap(
          api.POST("/api/subcategories/{subcategory_id}/merge", {
            params: { path: { subcategory_id: id } },
            body: { into_id: intoId },
          }),
        );
        return;
      }
      const { response, error } = await api.DELETE("/api/subcategories/{subcategory_id}", {
        params: { path: { subcategory_id: id } },
      });
      if (!response.ok) {
        throw new Error(detailOf(error) ?? i18n.t("errors.deleteFailed"));
      }
    },
  );
}
