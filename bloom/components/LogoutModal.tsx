import {
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
} from '@/components/ui/modal';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon, CloseIcon } from '@/components/ui/icon';
import { useState } from 'react';

export const LogoutModal = ({
  showModal,
  onClose,
  onLogout,
}: {
  showModal: boolean;
  onClose: (value: boolean) => void;
  onLogout: (value: boolean) => void;
}) => {
  return (
    <Modal
      isOpen={showModal}
      onClose={() => {
        onClose();
      }}
      size="md">
      <ModalBackdrop />
      <ModalContent>
        <ModalHeader>
          <Heading size="lg">Log out?</Heading>
          <ModalCloseButton>
            <Icon as={CloseIcon} />
          </ModalCloseButton>
        </ModalHeader>
        <ModalBody>
          <Text>
            Are you sure you want to log out? You'll need to sign in again to access your account.
          </Text>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            action="secondary"
            className="mr-3"
            onPress={() => {
              onClose();
            }}>
            <ButtonText>Cancel</ButtonText>
          </Button>
          <Button
            onPress={() => {
              onLogout();
            }}>
            <ButtonText className='text-white'>Log out</ButtonText>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
