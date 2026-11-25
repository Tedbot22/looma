import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addAddress, deleteAddress, fetchAddresses, makeAddressDefault, updateAddress, type AddressValues } from '../api/account'
import { queryKeys } from '../api/queryKeys'
import { useAuth } from '../context/AuthContext'

export type { AddressValues }

// The logged-in customer's saved delivery locations, default first.
export function useAddresses() {
  const { user } = useAuth()

  return useQuery({
    queryKey: queryKeys.account.addresses(user?.id),
    queryFn: () => fetchAddresses(user!.id),
    enabled: !!user,
  })
}

// Add, edit, delete and set-default, each refreshing the list afterwards.
export function useAddressActions() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.account.addresses(user?.id) })

  return {
    // Returns the new address's id, so checkout can select it straight away.
    async add(values: AddressValues): Promise<string> {
      const id = await addAddress(user!.id, values)
      await refresh()
      return id
    },

    async update(id: string, values: AddressValues) {
      await updateAddress(id, values)
      await refresh()
    },

    async remove(id: string) {
      await deleteAddress(id)
      await refresh()
    },

    async makeDefault(id: string) {
      await makeAddressDefault(id)
      await refresh()
    },
  }
}
