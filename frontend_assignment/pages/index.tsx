import detectEthereumProvider from "@metamask/detect-provider"
import { Strategy, ZkIdentity } from "@zk-kit/identity"
import { generateMerkleProof, Semaphore } from "@zk-kit/protocols"
import { providers } from "ethers"
import Head from "next/head"
import React from "react"
import { Container, Typography, TextField, Stack, Button, Backdrop, CircularProgress } from '@mui/material'
import * as yup from 'yup';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useSnackbar } from 'notistack';
import * as ethers from 'ethers'
import Greeter from "artifacts/contracts/Greeters.sol/Greeters.json"



const formSchema = yup.object().required().shape({
    name: yup.string().required('Input your name!'),
    age: yup.number().max(115, 'You should be younger than age 115!!').min(0, 'You must be older than age 0!').required('Input your age!'),
    address: yup.string().test("isAddress", 'You should input valid address', (value) => ethers.utils.isAddress(value || '')).required()
});

type TForm = Readonly<{
    name: string;
    address: string;
    age: number;
}>;

export default function Home() {
    const { enqueueSnackbar } = useSnackbar();

    const [loading, setLoading] = React.useState(false)
    const [signal, setSignal] = React.useState("default message");
    const [currentGreeting, setCurrentGreeting] = React.useState('');

    const { register, handleSubmit, formState: { errors } } = useForm<TForm>({ resolver: yupResolver(formSchema) });
    const onSubmit = (data: TForm) => {
        const signal = JSON.stringify(data)
        setSignal(signal);
        console.log(signal);
        enqueueSnackbar("Signal Saved!");
    };

    const greet = React.useCallback(async () => {
        if (!signal || signal === 'default message') {
            return enqueueSnackbar("Save Your Info first!", {
                variant: 'error'
            });
        }

        setLoading(true)
    
        const provider = (await detectEthereumProvider()) as any

        await provider.request({ method: "eth_requestAccounts" })

        const ethersProvider = new providers.Web3Provider(provider)
        const signer = ethersProvider.getSigner()
        const message = await signer.signMessage("Sign this message to create your identity!")

        const identity = new ZkIdentity(Strategy.MESSAGE, message)
        const identityCommitment = identity.genIdentityCommitment()
        const identityCommitments = await (await fetch("./identityCommitments.json")).json()

        const merkleProof = generateMerkleProof(20, BigInt(0), identityCommitments, identityCommitment)

        const hash = ethers.utils.id(signal).slice(0, 31)

        const witness = Semaphore.genWitness(
            identity.getTrapdoor(),
            identity.getNullifier(),
            merkleProof,
            merkleProof.root,
           hash
        )

        const { proof, publicSignals } = await Semaphore.genProof(witness, "./semaphore.wasm", "./semaphore_final.zkey")
        const solidityProof = Semaphore.packToSolidityProof(proof)

        const response = await fetch("/api/greet", {
            method: "POST",
            body: JSON.stringify({
                greeting: hash,
                nullifierHash: publicSignals.nullifierHash,
                solidityProof: solidityProof
            })
        })

        if (response.status !== 200) {
            const errorMessage = await response.text()
            enqueueSnackbar(errorMessage, { variant: 'error'})
        } else {
            enqueueSnackbar("Your anonymous greeting is onchain :)")
        }
        setLoading(false)
    }, [signal, enqueueSnackbar])


    React.useEffect(() => {
        const listener = async () => {
          const provider = (await detectEthereumProvider()) as any
          const ethersProvider = new providers.Web3Provider(provider)
          const greetingContract = new ethers.Contract(
            '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', // greeter contract address
            Greeter.abi,
            ethersProvider,
          )
          greetingContract.on('NewGreeting', (greeting) => {
              console.log('new greeting!!')
              setCurrentGreeting(greeting)
          })
        }
        listener()
      }, [])

    return (
        <Container maxWidth="sm">
            <Head>
                <title>Greetings</title>
                <meta name="description" content="A simple Next.js/Hardhat privacy application with Semaphore." />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <Backdrop
                sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
                open={loading}
                onClick={() => setLoading(false)}
            >
        <CircularProgress color="inherit" />
      </Backdrop>

            <Typography variant="h3" component="div" gutterBottom>
                Make a proof
            </Typography>

            <Stack spacing={3}>
                <TextField
                    disabled
                    label="Current Greeting"
                    value={currentGreeting}
                />
                <TextField
                required
                label="name"
                error={'name' in errors}
                helperText={errors.name?.message}
                {...register('name')}
                />
                <TextField required label="address"
                error={'address' in errors}
                helperText={errors.address?.message}
                {...register('address')}  />
                <TextField
                required
                label="age"
                type="number"
                error={'age' in errors}
                helperText={errors.age?.message}
                {...register('age')}
                />
                <Button
                color="primary"
                variant="contained"
                size="large"
                onClick={handleSubmit(onSubmit)}
                >
                save your message
                </Button>

                <Button
                color="primary"
                variant="contained"
                size="large"
                onClick={greet}
                >
                Signal!
                </Button>
             </Stack>



        </Container>

    )
}
