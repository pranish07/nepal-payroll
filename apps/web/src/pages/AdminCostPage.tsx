import { Alert, AlertIcon, Badge, Box, Select, SimpleGrid, Table, TableContainer, Tbody, Td, Text, Th, Thead, Tr } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/PageState';
import { api } from '../lib/api';
import { formatNprPaisa } from '../lib/format';
import { useRole } from '../lib/role';
import type { AdminCostView } from '../lib/types';
import { useState } from 'react';

export function AdminCostPage() {
  const { runId = '' } = useParams();
  const { role } = useRole();
  const [group, setGroup] = useState<'ALL' | 'SSF' | 'NON_SSF'>('ALL');

  const view = useQuery({
    queryKey: ['admin-cost', runId, group],
    queryFn: () =>
      api.get<AdminCostView>(`/api/admin/runs/${runId}/cost-view?group=${group}`),
    enabled: role === 'admin' && runId.length > 0,
  });

  if (role !== 'admin') {
    return (
      <Alert status="error" borderRadius="md">
        <AlertIcon />
        <Text>
          The admin cost view is restricted to the admin role. Switch roles in the header to see it.
        </Text>
      </Alert>
    );
  }

  return (
    <QueryState isLoading={view.isLoading} error={view.error}>
      {view.data && (
        <Box>
          <PageHeader
            title="Admin cost view"
            description={`${view.data.period.label} · ${view.data.status}. Secret compensation and company cost are never part of the employee payslip.`}
            actions={
              <Select
                size="sm"
                width="160px"
                bg="white"
                value={group}
                onChange={(event) => setGroup(event.target.value as typeof group)}
              >
                <option value="ALL">All employees</option>
                <option value="SSF">SSF only</option>
                <option value="NON_SSF">Non-SSF only</option>
              </Select>
            }
          />

          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={5}>
            <StatCard label="Secret component" value={formatNprPaisa(view.data.totals.secretPaisa ?? 0)} />
            <StatCard
              label="Employer SSF"
              value={formatNprPaisa(view.data.totals.ssfEmployerPaisa)}
            />
            <StatCard
              label="Company cost"
              value={formatNprPaisa(view.data.totals.companyCostPaisa ?? 0)}
            />
            <StatCard
              label="Paid to employees"
              value={formatNprPaisa(view.data.totals.paidOutToEmployeePaisa ?? 0)}
            />
          </SimpleGrid>

          <Card p={0} overflow="hidden">
            <TableContainer overflowX="auto">
              <Table size="sm" variant="simple">
              <Thead bg="purple.50">
                <Tr>
                  <Th>Code</Th>
                  <Th>Name</Th>
                  <Th isNumeric>Gross</Th>
                  <Th isNumeric>Employer SSF</Th>
                  <Th isNumeric>Secret</Th>
                  <Th isNumeric>Company cost</Th>
                  <Th isNumeric>Net paid</Th>
                  <Th>Secret note (admin only)</Th>
                </Tr>
              </Thead>
              <Tbody>
                {view.data.rows.map((row) => (
                  <Tr key={row.payslipId}>
                    <Td fontFamily="mono">{row.code}</Td>
                    <Td>
                      {row.fullName} <Badge colorScheme="gray">{row.employmentType}</Badge>
                    </Td>
                    <Td isNumeric>{formatNprPaisa(row.grossPaisa)}</Td>
                    <Td isNumeric>{formatNprPaisa(row.employerSsfPaisa)}</Td>
                    <Td isNumeric color="purple.700" fontWeight="bold">
                      {formatNprPaisa(row.secretPaisa)}
                    </Td>
                    <Td isNumeric fontWeight="bold">
                      {formatNprPaisa(row.companyCostPaisa)}
                    </Td>
                    <Td isNumeric>{formatNprPaisa(row.paidOutToEmployeePaisa)}</Td>
                    <Td fontSize="xs" color="gray.600">
                      {view.data.status === 'FINALIZED'
                        ? 'frozen at finalization'
                        : (row.secretNote ?? '—')}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            </TableContainer>
          </Card>
        </Box>
      )}
    </QueryState>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
      <Text fontSize="xs" color="gray.500">
        {label}
      </Text>
      <Text fontWeight="bold" mt={1}>
        {value}
      </Text>
    </Box>
  );
}
