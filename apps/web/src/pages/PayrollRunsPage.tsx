import {
  Badge,
  Box,
  Button,
  HStack,
  Heading,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { QueryState } from '../components/PageState';
import { ApiError, api } from '../lib/api';
import { formatDate, formatNprPaisa } from '../lib/format';
import { useRole } from '../lib/role';
import type { Period, Run } from '../lib/types';

function StatusBadge({ status }: { status: Period['runStatus'] }) {
  if (status === 'FINALIZED') return <Badge colorScheme="green">Finalized</Badge>;
  if (status === 'DRAFT') return <Badge colorScheme="orange">Draft</Badge>;
  return <Badge colorScheme="gray">Not run</Badge>;
}

export function PayrollRunsPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const periods = useQuery({ queryKey: ['periods'], queryFn: () => api.get<Period[]>('/api/periods') });

  const calculate = useMutation({
    mutationFn: (periodId: string) => api.post<Run>(`/api/periods/${periodId}/run`),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ['periods'] });
      toast({ title: `Draft calculated for ${run.period.label}`, status: 'success' });
      navigate(`/runs/${run.id}`);
    },
    onError: (error) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Could not calculate the draft.',
        status: 'error',
      });
    },
  });

  return (
    <Box>
      <HStack justify="space-between" align="flex-end" mb={6}>
        <Box>
          <Heading size="lg">Payroll periods</Heading>
          <Text color="gray.600">
            Fiscal year 2083/84 · twelve monthly periods. Calculations use the policy version
            effective for the period.
          </Text>
        </Box>
        {role === 'employee' && <Badge colorScheme="green">Read-only employee view</Badge>}
      </HStack>

      <QueryState isLoading={periods.isLoading} error={periods.error}>
        <TableContainer bg="white" borderRadius="lg" boxShadow="sm">
          <Table size="sm">
            <Thead bg="gray.50">
              <Tr>
                <Th>Period</Th>
                <Th>Dates</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {(periods.data ?? []).map((period) => (
                <Tr key={period.id}>
                  <Td fontWeight="medium">{period.label}</Td>
                  <Td color="gray.600">
                    {formatDate(period.startDate)} → {formatDate(period.endDate)}
                  </Td>
                  <Td>
                    <StatusBadge status={period.runStatus} />
                  </Td>
                  <Td>
                    <HStack spacing={2}>
                      {period.runId && (
                        <Button
                          as={RouterLink}
                          to={`/runs/${period.runId}`}
                          size="xs"
                          variant="outline"
                          colorScheme="brand"
                        >
                          Open run
                        </Button>
                      )}
                      {!period.runId && role === 'admin' && (
                        <Button
                          size="xs"
                          colorScheme="brand"
                          isLoading={calculate.isPending && calculate.variables === period.id}
                          onClick={() => calculate.mutate(period.id)}
                        >
                          Calculate draft
                        </Button>
                      )}
                      {!period.runId && role !== 'admin' && (
                        <Text fontSize="xs" color="gray.500">
                          An admin has not run this period.
                        </Text>
                      )}
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </QueryState>

      <HStack mt={4} color="gray.500" fontSize="sm" spacing={4}>
        <Text>Money is stored as integer paisa.</Text>
        <Text>Example: {formatNprPaisa(8_473_833)}</Text>
      </HStack>
    </Box>
  );
}
