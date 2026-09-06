import { prisma } from './database/index.js';
async function seed() {
    console.log('🌱 Seeding 11 store categories into database...');
    const categories = [
        {
            name: '🐙 GitHub',
            slug: 'github',
            description: 'GitHub Student Developer Packs, Copilot subscriptions, and developer accounts.',
            position: 1,
            product: {
                name: 'GitHub Student Developer Pack',
                slug: 'github-student-pack',
                description: 'Includes GitHub Copilot, Canva, Namecheap domain, and $200+ in dev credits.',
                variantName: '1 Year License',
                price: 15.00,
            },
        },
        {
            name: '🍿 Netflix',
            slug: 'netflix',
            description: 'Netflix Premium 4K UHD profiles and private accounts.',
            position: 2,
            product: {
                name: 'Netflix Premium 4K UHD',
                slug: 'netflix-premium-4k',
                description: 'High quality 4K UHD streaming profile with custom PIN lock.',
                variantName: '1 Month Private Profile',
                price: 5.00,
            },
        },
        {
            name: '✂️ CapCut',
            slug: 'capcut',
            description: 'CapCut Pro subscriptions for video editing on Mobile & Desktop.',
            position: 3,
            product: {
                name: 'CapCut Pro',
                slug: 'capcut-pro',
                description: 'Unlock all premium effects, transition templates, and cloud storage.',
                variantName: '1 Month Pro Subscription',
                price: 4.00,
            },
        },
        {
            name: '🚀 Grok',
            slug: 'grok',
            description: 'xAI Grok 2 & Grok Vision AI accounts.',
            position: 4,
            product: {
                name: 'Grok AI Access',
                slug: 'grok-ai-access',
                description: 'Direct access to Grok 2 real-time AI and image generation models.',
                variantName: '1 Month Access',
                price: 10.00,
            },
        },
        {
            name: '🎨 Canva',
            slug: 'canva',
            description: 'Canva Pro educational and team invites for full graphics access.',
            position: 5,
            product: {
                name: 'Canva Pro Upgrade',
                slug: 'canva-pro-upgrade',
                description: 'Upgrade your personal email to Canva Pro with unlimited brand kits & elements.',
                variantName: '1 Year Pro License',
                price: 6.00,
            },
        },
        {
            name: '🧠 ChatGPT',
            slug: 'chatgpt',
            description: 'OpenAI ChatGPT Plus, GPT-4o, and DALL-E 3 subscription accounts.',
            position: 6,
            product: {
                name: 'ChatGPT Plus (GPT-4o)',
                slug: 'chatgpt-plus',
                description: 'Full access to GPT-4o, canvas editor, voice mode, and custom GPTs.',
                variantName: '1 Month Account',
                price: 12.00,
            },
        },
        {
            name: '✨ Gemini',
            slug: 'gemini',
            description: 'Google Gemini Advanced 2.0 & 2TB One AI Premium plans.',
            position: 7,
            product: {
                name: 'Gemini Advanced 2.0',
                slug: 'gemini-advanced',
                description: 'Access 1.5 Pro & 2.0 Flash models with 2TB Google Cloud storage.',
                variantName: '1 Month Subscription',
                price: 10.00,
            },
        },
        {
            name: '🤖 Claude',
            slug: 'claude',
            description: 'Anthropic Claude 3.5 Sonnet & Claude Pro subscriptions.',
            position: 8,
            product: {
                name: 'Claude Pro (Sonnet 3.5)',
                slug: 'claude-pro',
                description: '5x usage limits, priority bandwidth, and early access to new features.',
                variantName: '1 Month Account',
                price: 14.00,
            },
        },
        {
            name: '📧 Email',
            slug: 'email',
            description: 'Aged Webmail, Gmail, Outlook, and Custom Domain Emails.',
            position: 9,
            product: {
                name: 'Aged Verified Gmail Accounts',
                slug: 'aged-gmail-accounts',
                description: 'Phone verified, PVA Gmail accounts created with clean IPs.',
                variantName: 'Pack of 5 Accounts',
                price: 3.00,
            },
        },
        {
            name: '📐 Figma',
            slug: 'figma',
            description: 'Figma Professional & Organization team invites.',
            position: 10,
            product: {
                name: 'Figma Professional Plan',
                slug: 'figma-pro',
                description: 'Unlimited Figma files, team libraries, and dev mode access.',
                variantName: '1 Year License',
                price: 15.00,
            },
        },
        {
            name: '🛡️ VPN',
            slug: 'vpn',
            description: 'NordVPN, ExpressVPN, Surfshark, and CyberGhost premium keys.',
            position: 11,
            product: {
                name: 'NordVPN Premium Account',
                slug: 'nordvpn-premium',
                description: 'High-speed encrypted servers, Threat Protection, and Meshnet.',
                variantName: '1 Year Subscription',
                price: 8.00,
            },
        },
    ];
    for (const catData of categories) {
        const category = await prisma.category.upsert({
            where: { slug: catData.slug },
            update: {
                name: catData.name,
                description: catData.description,
                position: catData.position,
                isEnabled: true,
            },
            create: {
                name: catData.name,
                slug: catData.slug,
                description: catData.description,
                position: catData.position,
                isEnabled: true,
            },
        });
        const product = await prisma.product.upsert({
            where: { slug: catData.product.slug },
            update: {
                name: catData.product.name,
                description: catData.product.description,
                categoryId: category.id,
                status: 'ACTIVE',
            },
            create: {
                name: catData.product.name,
                slug: catData.product.slug,
                description: catData.product.description,
                categoryId: category.id,
                status: 'ACTIVE',
            },
        });
        const existingVariant = await prisma.productVariant.findFirst({
            where: { productId: product.id },
        });
        if (!existingVariant) {
            await prisma.productVariant.create({
                data: {
                    productId: product.id,
                    name: catData.product.variantName,
                    price: catData.product.price,
                    currency: 'USD',
                    deliveryType: 'MANUAL',
                    isEnabled: true,
                },
            });
        }
        console.log(`✅ Upserted category: ${category.name}`);
    }
    console.log('🎉 Category seeding complete!');
    process.exit(0);
}
seed().catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
});
