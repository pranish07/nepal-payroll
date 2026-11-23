import { Alert, AlertIcon, Badge, Box, Button, HStack, Heading, Select, SimpleGrid, Stat, StatLabel, StatNumber, Table, TableContainer, Tbody, Td, Text, Th, Thead, Tr, useToast } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { DraftBanner, QueryState } from '../components/PageState';
import { ApiError, api } from '../lib/api';
import { formatDateTime, formatNprPaisa } from '../lib/format';
import { useRole } from '../lib/role';
import type { Run } from '../lib/types';

export function PayrollRunPage() {
  const { runId = '' } = useParams();
  const { role } = useRole();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [group, setGroup] = useState<'ALL' | 'SSF' | 'NON_SSF'>('ALL');

  const run = useQuery({
    queryKey: ['run', runId, group],
    queryFn: () => api.get<Run>(`/api/runs/${runId}?group=${group}`),
    enabled: runId.length > 0,
  });

  const finalize = useMutation({
    mutationFn: () => api.post<Run>(`/api/runs/${runId}/finalize`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['run', runId] });
      void queryClient.invalidateQueries({ queryKey: ['periods'] });
      toast({ title: 'Run finalized', status: 'success' });
    },
    onError: (error) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Could not finalize the run.',
        status: 'error',
      });
    },
  });

  return (
    <QueryState isLoading={run.isLoading} error={run.error}>
      {run.data && (
        <Box>
          <HStack justify="space-between" align="flex-end" mb={4} wrap="wrap" spacing={3}>
            <Box>
              <HStack>
                <Heading size="lg">{run.data.period.label}</Heading>
                <Badge colorScheme={run.data.status === 'FINALIZED' ? 'green' : 'orange'}>
                  {run.data.status}
                </Badge>
              </HStack>
              <Text color="gray.600">
                {run.data.period.startDate} → {run.data.period.endDate} · policy version{' '}
                {run.data.policyVersion} · {run.data.period.fiscalYearLabel}
              </Text>
            </Box>
            <HStack>
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
              {role === 'admin' && run.data.status === 'DRAFT' && (
                <Button
                  size="sm"
                  colorScheme="green"
                  isLoading={finalize.isPending}
                  onClick={() => finalize.mutate()}
                >
                  Finalize run
                </Button>
              )}
              {role === 'admin' && (
                <Button
                  as={RouterLink}
                  to={`/runs/${run.data.id}/admin-cost`}
                  size="sm"
                  colorScheme="purple"
                  variant="outline"
                >
                  Admin cost
                </Button>
              )}
            </HStack>
          </HStack>

          {run.data.status === 'DRAFT' && <DraftBanner />}
          {run.data.status === 'FINALIZED' && (
            <Alert status="success" borderRadius="md" mb={4}>
              <AlertIcon />
              <AlertText finalizedAt={run.data.finalizedAt} />
            </Alert>
          )}

          <SimpleGrid columns={{ base: 2, md: 3, lg: 5 }} spacing={3} mb={6}>
            <StatCard label="Employees" value={String(run.data.totals.employeeCount)} />
            <StatCard label="Gross pay" value={formatNprPaisa(run.data.totals.grossPaisa)} />
            <StatCard label="Employee SSF" value={formatNprPaisa(run.data.totals.ssfEmployeePaisa)} />
            <StatCard label="TDS" value={formatNprPaisa(run.data.totals.tdsPaisa)} />
            <StatCard label="Net pay" value={formatNprPaisa(run.data.totals.netPaisa)} />
          </SimpleGrid>

          {run.data.warnings.map((warning) => (
            <Alert key={warning.code} status="warning" borderRadius="md" mb={2}>
              <AlertIcon />
              <Text fontSize="sm">
                {warning.message} ({warning.employeeCount} employee
                {warning.employeeCount === 1 ? '' : 's'})
              </Text>
            </Alert>
          ))}

          <TableContainer bg="white" borderRadius="lg" boxShadow="sm">
            <Table size="sm">
              <Thead bg="gray.50">
                <Tr>
                  <Th>Code</Th>
                  <Th>Employee</Th>
                  <Th>Type</Th>
                  <Th isNumeric>Days</Th>
                  <Th isNumeric>Gross</Th>
                  <Th isNumeric>SSF</Th>
                  <Th isNumeric>TDS</Th>
                  <Th isNumeric>Advance</Th>
                  <Th isNumeric>Net</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {run.data.payslips.map((payslip) => (
                  <Tr key={payslip.id}>
                    <Td fontFamily="mono">{payslip.code}</Td>
                    <Td>
                      {payslip.fullName}
                      <Text fontSize="xs" color="gray.500">
                        {payslip.department}
                      </Text>
                    </Td>
                    <Td>{payslip.employmentType}</Td>
                    <Td isNumeric>
                      {payslip.daysEmployed}/{payslip.daysInPeriod}
                    </Td>
                    <Td isNumeric>{formatNprPaisa(payslip.grossPaisa)}</Td>
                    <Td isNumeric>{formatNprPaisa(payslip.ssfEmployeePaisa)}</Td>
                    <Td isNumeric>{formatNprPaisa(payslip.tdsPaisa)}</Td>
                    <Td isNumeric>{formatNprPaisa(payslip.advanceRecoveryPaisa)}</Td>
                    <Td isNumeric fontWeight="bold">
                      {formatNprPaisa(payslip.netPaisa)}
                    </Td>
                    <Td>
                      <Button
                        as={RouterLink}
                        to={`/payslips/${payslip.id}`}
                        size="xs"
                        variant="outline"
                      >
                        Payslip
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>

          <HStack mt={4} fontSize="sm" color="gray.600" wrap="wrap" spacing={5}>
            <Text>Total deductions: {formatNprPaisa(run.data.totals.totalDeductionsPaisa)}</Text>
            <Text>
              Employer SSF (memo): {formatNprPaisa(run.data.totals.ssfEmployerPaisa)}
            </Text>
            <Text>Employer cost: {formatNprPaisa(run.data.totals.employerCostPaisa)}</Text>
          </HStack>
        </Box>
      )}
    </QueryState>
  );
}

function AlertText({ finalizedAt }: { finalizedAt: string | null }) {
  return (
    <Text fontSize="sm">
      This run is <strong>finalized</strong> and immutable. Finalized at {formatDateTime(finalizedAt)}.
    </Text>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
      <Stat>
        <StatLabel color="gray.500" fontSize="xs">
          {label}
        </StatLabel>
        <StatNumber fontSize="md">{value}</StatNumber>
      </Stat>
    </Box>
  );
}
