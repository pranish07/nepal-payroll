import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Stack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Tooltip,
  Thead,
  Tr,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ViewIcon } from '@chakra-ui/icons';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/PageState';
import { ApiError, api } from '../lib/api';
import { formatNprPaisa, parseNprToPaisa } from '../lib/format';
import { useRole } from '../lib/role';
import type { Employee, EmploymentType } from '../lib/types';

const emptyForm = {
  code: '',
  fullName: '',
  department: '',
  designation: '',
  employmentType: 'NON_SSF' as EmploymentType,
  ssfNumber: '',
  basic: '',
  joiningDate: '2026-11-17',
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankBranch: '',
};

export function EmployeesPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | EmploymentType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [form, setForm] = useState(emptyForm);

  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get<Employee[]>('/api/employees'),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (employees.data ?? []).filter((employee) => {
      if (typeFilter !== 'ALL' && employee.employmentType !== typeFilter) return false;
      if (statusFilter !== 'ALL' && employee.status !== statusFilter) return false;
      if (!term) return true;
      return (
        employee.code.toLowerCase().includes(term) ||
        employee.fullName.toLowerCase().includes(term) ||
        employee.department.toLowerCase().includes(term)
      );
    });
  }, [employees.data, search, statusFilter, typeFilter]);

  const create = useMutation({
    mutationFn: () => {
      const basicPaisa = parseNprToPaisa(form.basic);
      if (basicPaisa === null) throw new Error('Basic pay must be a rupee amount with at most 2 decimals.');
      return api.post<Employee>('/api/employees', {
        code: form.code.trim().toUpperCase(),
        fullName: form.fullName.trim(),
        department: form.department.trim(),
        designation: form.designation.trim(),
        employmentType: form.employmentType,
        ssfNumber: form.employmentType === 'SSF' ? form.ssfNumber.trim() : null,
        basicPaisa,
        joiningDate: form.joiningDate,
        bankName: form.bankName.trim(),
        bankAccountName: form.bankAccountName.trim(),
        bankAccountNumber: form.bankAccountNumber.trim(),
        bankBranch: form.bankBranch.trim(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: 'Employee created', status: 'success' });
      setForm(emptyForm);
      onClose();
    },
    onError: (error) => {
      toast({
        title: error instanceof ApiError ? error.message : error.message,
        status: 'error',
      });
    },
  });

  return (
    <Box>
      <PageHeader
        title="Employees"
        description={`${employees.data?.length ?? 0} people on file. Deactivation is a soft delete, so history stays intact.`}
        actions={
          role === 'admin' ? (
            <Button colorScheme="brand" onClick={onOpen}>
              Add employee
            </Button>
          ) : undefined
        }
      />

      <Stack
        direction={{ base: 'column', md: 'row' }}
        mb={4}
        spacing={3}
        align={{ base: 'stretch', md: 'center' }}
      >
        <Input
          placeholder="Search code, name, or department"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxW={{ base: '100%', md: '320px' }}
          bg="white"
        />
        <Select
          maxW={{ base: '100%', md: '180px' }}
          bg="white"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
        >
          <option value="ALL">All employment types</option>
          <option value="SSF">SSF</option>
          <option value="NON_SSF">Non-SSF</option>
        </Select>
        <Select
          maxW={{ base: '100%', md: '160px' }}
          bg="white"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </Select>
      </Stack>

      <QueryState isLoading={employees.isLoading} error={employees.error}>
        <Card p={0} overflow="hidden">
          <TableContainer overflowX="auto">
            <Table size="sm" variant="simple">
            <Thead bg="gray.50">
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th isNumeric>Basic (monthly)</Th>
                <Th>View</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtered.map((employee) => (
                <Tr key={employee.id}>
                  <Td fontFamily="mono">{employee.code}</Td>
                  <Td>
                    <RouterLink to={`/employees/${employee.id}`}>{employee.fullName}</RouterLink>
                    <Text fontSize="xs" color="gray.500">
                      {employee.designation}
                    </Text>
                  </Td>
                  <Td>{employee.department}</Td>
                  <Td>
                    <Badge colorScheme={employee.employmentType === 'SSF' ? 'blue' : 'gray'}>
                      {employee.employmentType}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge colorScheme={employee.status === 'ACTIVE' ? 'green' : 'red'}>
                      {employee.status}
                    </Badge>
                  </Td>
                  <Td isNumeric>{formatNprPaisa(employee.basicPaisa)}</Td>
                  <Td>
                    <Tooltip label="View employee details" placement="top">
                      <IconButton
                        as={RouterLink}
                        to={`/employees/${employee.id}`}
                        aria-label={`View details for ${employee.fullName}`}
                        icon={<ViewIcon />}
                        size="sm"
                        variant="ghost"
                        colorScheme="brand"
                      />
                    </Tooltip>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          </TableContainer>
        </Card>
        {filtered.length === 0 && (
          <Text mt={4} color="gray.500">
            No employees match these filters.
          </Text>
        )}
      </QueryState>

      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add employee</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl isRequired>
                <FormLabel>Code</FormLabel>
                <Input
                  placeholder="EMP-007"
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value })}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Full name</FormLabel>
                <Input
                  value={form.fullName}
                  onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Department</FormLabel>
                <Input
                  value={form.department}
                  onChange={(event) => setForm({ ...form, department: event.target.value })}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Designation</FormLabel>
                <Input
                  value={form.designation}
                  onChange={(event) => setForm({ ...form, designation: event.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Employment type</FormLabel>
                <Select
                  value={form.employmentType}
                  onChange={(event) =>
                    setForm({ ...form, employmentType: event.target.value as EmploymentType })
                  }
                >
                  <option value="SSF">SSF</option>
                  <option value="NON_SSF">Non-SSF</option>
                </Select>
              </FormControl>
              <FormControl isRequired={form.employmentType === 'SSF'}>
                <FormLabel>SSF number</FormLabel>
                <Input
                  value={form.ssfNumber}
                  onChange={(event) => setForm({ ...form, ssfNumber: event.target.value })}
                  isDisabled={form.employmentType !== 'SSF'}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Basic pay (NPR/month)</FormLabel>
                <Input
                  placeholder="50000.00"
                  value={form.basic}
                  onChange={(event) => setForm({ ...form, basic: event.target.value })}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Joining date</FormLabel>
                <Input
                  type="date"
                  value={form.joiningDate}
                  onChange={(event) => setForm({ ...form, joiningDate: event.target.value })}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Bank</FormLabel>
                <Input
                  value={form.bankName}
                  onChange={(event) => setForm({ ...form, bankName: event.target.value })}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Account name</FormLabel>
                <Input
                  value={form.bankAccountName}
                  onChange={(event) => setForm({ ...form, bankAccountName: event.target.value })}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Account number</FormLabel>
                <Input
                  value={form.bankAccountNumber}
                  onChange={(event) => setForm({ ...form, bankAccountNumber: event.target.value })}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Bank branch</FormLabel>
                <Input
                  value={form.bankBranch}
                  onChange={(event) => setForm({ ...form, bankBranch: event.target.value })}
                />
              </FormControl>
            </SimpleGrid>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button colorScheme="brand" isLoading={create.isPending} onClick={() => create.mutate()}>
              Create employee
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
